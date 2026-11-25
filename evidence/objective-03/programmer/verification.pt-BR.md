# Programador · Verificação da etapa

[English](verification.md) · [Modelo de palavra e limites de recursos](limits.pt-BR.md) · [Contrato do registro de cálculo](../calculation-proof/contract.pt-BR.md) · [Plano de etapas](../PLAN.pt-BR.md) · [Registro de testes](tests.json)

Os resultados cobrem a etapa Programador do Objetivo 03, incluindo conversão exata entre bases, operações de largura fixa, interpretação de sinal, registros de cálculo locais e regressões dos módulos já entregues.

## Verificações locais

| Verificação | Resultado observado |
| --- | --- |
| Referência independente Python na CLI Windows | 368 aprovados e 0 falhas nas compilações finais otimizada e instrumentada, com Python 3.14.7. A suíte cobre as 11 operações, 51 rejeições estruturadas, seis reexecuções com registros de cálculo idênticos e uma verificação de procedência da entrada original. [Oráculo independente](../../../tests/verify-programmer.py) |
| CLI e WASM do Programador | 36 respostas completas coincidiram. Seis verificações adicionais de isolamento entre módulos passaram. [Executor de paridade](../../../tests/check-programmer-targets.mjs) |
| Testes Rust dos membros padrão do workspace | 67 aprovados no núcleo Standard (16) e no motor universal (51). A formatação Rust e o Clippy dos membros padrão passaram. |
| Testes web no Node | 65 aprovados e 0 falhas. |
| Chrome instalado no Windows | 74 aprovados na distribuição final, incluindo os sete testes do Programador. [Observações do navegador](browser.json) · [Captura no navegador](browser.png) |
| Offline e idiomas sob demanda | 10 verificações avulsas passaram na distribuição final. O teste do Programador no navegador também conferiu isolamento de módulos e cálculo offline. [Executor offline](../../../tests/verify-web-offline.mjs) |
| Regressões do Standard | 157 casos independentes de racionais e decimais, 20 comparações entre CLI e WASM e 291 casos de valores estruturados passaram. [Oráculo independente](../../../tests/oracle.py) · [Executor de paridade](../../../tests/check-targets.mjs) · [Oráculo estruturado](../../../crates/dars-core/tests/structured-oracle.py) |
| Módulos avançados anteriores | As referências independentes do Científico, Álgebra, Cálculo, Álgebra Linear, Geometria e Matemática Discreta passaram, respectivamente, em 177, 184, 210, 223, 159 e 289 casos. Entre CLI e WASM, coincidiram 19, 28, 27, 30, 32 e 38 registros, respectivamente. [Científico](../scientific/verification.pt-BR.md) · [Álgebra](../algebra/verification.pt-BR.md) · [Cálculo](../calculus/verification.pt-BR.md) · [Álgebra Linear](../linear-algebra/verification.pt-BR.md) · [Geometria](../geometry/verification.pt-BR.md) · [Matemática Discreta](../discrete-mathematics/verification.pt-BR.md) |
| Cobertura de linhas | Os testes Rust instrumentados e os oráculos na CLI nativa cobriram 521/523 linhas do Programador (99,62%), 8.442/8.688 do motor universal (97,17%) e 613/620 do núcleo Standard (98,87%). [Registro de testes](tests.json) |
| Build release com dependências fixadas no Windows | A CLI otimizada executou o oráculo independente. O release normal do aplicativo desktop concluiu a execução no WebView2 sob a política de segurança existente no Windows. [Medições Windows](windows-benchmark.json) |

A suíte independente usa inteiros de precisão arbitrária do Python, divisão arredondada para baixo nos deslocamentos aritméticos à direita e fatias de sequências de bits nas rotações. Confere simultaneamente as saídas binária, octal, decimal e hexadecimal, incluindo os zeros de preenchimento. Os casos incluem as larguras predefinidas de 8, 16, 32, 64 e 128 bits e larguras selecionadas entre 1 e 1.024 bits, inclusive as que não se alinham a dígitos octais ou hexadecimais. Os testes conferem que inverter uma rotação recupera a palavra, que a rotação preserva a contagem de bits iguais a um e que NOT, XOR e complemento de dois obedecem às identidades de largura fixa. [Oráculo independente](../../../tests/verify-programmer.py)

A suíte focada no navegador conferiu as 11 operações, a exibição do inteiro `9007199254740993` e a visualização de uma palavra de 1.024 bits com 64 bits por página. Verificou o ambiente localizado em sete idiomas e o layout RTL árabe a 320 px com as posições dos bits da esquerda para a direita. Também exportou e reimportou passivamente o registro exato de rotação, confirmou a preparação isolada do WASM do Programador, testou o cálculo após recarregar offline e observou cancelamento de worker com recuperação da entrada. [Testes do Programador no navegador](../../../apps/web/tests/programmer.spec.ts)

A captura no navegador mostra o tema azul-marinho, as quatro bases de saída e o bit de sinal destacado para o hexadecimal `80A2` com largura de 16 bits. A saída decimal com sinal é `-32606`. O SHA-256 da imagem é `59587873d668ea5af202a4d03ef327f519716a41ef6fc8e8ff4897c68da17105`. [Captura no navegador](browser.png)

## Verificações de representação e de limites

| Caso | Resultado observado |
| --- | --- |
| Hexadecimal `FF` sem sinal explícito em largura de 8 bits com exibição com sinal | Binário `11111111`, octal `377`, decimal `-1` e hexadecimal `FF`. |
| Hexadecimal `80` deslocado à direita em um bit, com largura 8 e exibição sem sinal | O deslocamento lógico retorna hexadecimal `40` e decimal `64`. O aritmético propaga o bit mais significativo e retorna hexadecimal `C0` e decimal `192`. |
| Complemento de dois do decimal `-128` em largura de 8 bits com sinal | O padrão de largura fixa permanece `80` em hexadecimal. O registro explica por que o menor valor com sinal conserva seu padrão. |
| Rotação à esquerda do hexadecimal `1001` em largura de 13 bits por `10^1023+57` | O registro indica contagem efetiva `4`. O resultado é binário `0000000011000`, octal `00030`, decimal `24` e hexadecimal `0018`. |

Os casos independentes também conferem os limites de entrada decimal com sinal e de padrões de bits, contagens iguais ou superiores à largura, preenchimento com zero em deslocamentos lógicos, propagação do bit mais significativo em deslocamentos aritméticos e a contagem decimal máxima de 1.024 dígitos. As reexecuções preservam largura, base de entrada, interpretação decimal e as condições aplicáveis de deslocamento ou descarte de bits. [Oráculo independente](../../../tests/verify-programmer.py) · [Motor de operações](../../../crates/dars-universal/src/programmer.rs)

## Dependências e segurança

O Programador usa os tipos de inteiro de precisão arbitrária já presentes no Rust. Os lockfiles de Rust e npm coincidem com os da etapa aceita de Matemática Discreta. Os operandos e as contagens seguem gramáticas limitadas de dígitos e opções. O registro preserva o texto original de exibição em um campo separado dos operandos interpretados. O CI inclui a referência independente e a verificação de paridade, e sua execução segue a publicação do commit da etapa. [Limites da requisição e do registro](../../../crates/dars-universal/src/lib.rs) · [Definição do CI](../../../.github/workflows/ci.yml)

## Tempos diretos no WASM

O executor Node mediu o WASM do Programador inicializado, incluindo a leitura da requisição no Rust e a serialização do registro de cálculo. Em 120 interações após 10 aquecimentos por expressão, p50/p95/p99 foram **0,0143 / 0,0512 / 0,0596 ms**. A inicialização levou **14,24 ms**. O WASM tinha **280.291 bytes**, com capacidade linear observada de **1.179.648 bytes**. O escalonamento pelo navegador, o início do worker e a renderização no DOM ficam fora dessa medição. O SHA-256 do WASM foi `d4a788f9fc311ca77e55dc3bb675faa0703d67677906880dc1afc5e103484084`. [Executor de paridade e medição](../../../tests/check-programmer-targets.mjs) · [Registro de testes](tests.json)

## Interação e recursos no Windows

Com um perfil novo, o aplicativo desktop levou **619,83 ms** até o resultado conferido do Standard. A seleção do Programador levou **23,89 ms** até o painel visível. Nas 39 interações conferidas de conversão, XOR e deslocamento à esquerda, p50/p95/p99 foram **60,98 / 73,37 / 75,92 ms**. Os tempos incluem o preenchimento dos campos da operação, o clique em Calcular, o ciclo do worker, o cálculo e a observação do resultado no DOM. Os **44** workers observados encerraram. A minimização e restauração via Win32 preservaram os dois operandos de XOR e o resultado conferido, o Standard manteve `0.3` quando selecionado novamente e as amostras após o fechamento mostraram zero descendentes. [Executor no Windows](../../../benchmarks/windows-programmer.mjs) · [Fases medidas](windows-benchmark.json)

A execução usou Windows **10.0.26200**, WebView2 **158.0.4370.33** e 20 processadores lógicos. Cada fase teve seis amostras em cerca de cinco segundos. As colunas de memória mostram as medianas em MiB para a árvore de processos / processo DARS / auxiliares do WebView2. CPU é a taxa amostrada em relação a um processador lógico, e os workers foram contados ao fim de cada fase.

| Fase | Memória privada residente em MiB | Commit privado em MiB | CPU | Workers |
| --- | ---: | ---: | ---: | ---: |
| Standard visível | 98,03 / 4,33 / 93,70 | 233,52 / 6,35 / 227,18 | 0,31% | 1 |
| Programador sob carga | 123,39 / 4,27 / 119,12 | 261,11 / 6,37 / 254,74 | 57,95% | 0 |
| Programador em repouso | 150,88 / 4,27 / 146,61 | 285,45 / 6,37 / 279,09 | 0,00% | 0 |
| Programador minimizado | 92,49 / 4,28 / 88,21 | 253,99 / 6,37 / 247,62 | 3,38% | 0 |
| Programador restaurado | 107,32 / 4,31 / 103,01 | 281,90 / 6,37 / 275,53 | 0,31% | 0 |
| Após fechar | 0,00 / 0,00 / 0,00 | 0,00 / 0,00 / 0,00 | 0,00% | 0 |

Workers de curta duração abriram e fecharam entre os pontos finais das fases. A memória privada residente caiu durante a minimização. A maior mediana de commit privado ocorreu na fase de repouso e ficou concentrada no WebView2. A medição cobre um ciclo curto. A meta de 100 MB incrementais de memória física e a retenção em ciclos mais longos seguem abertas. [Dívida de memória e protocolo](../../objective-02/revision-02/memory-debt.pt-BR.md)

O SHA-256 do executável foi `3c40f2029a91b2713a16b78e3603b6bdedbe71a32d1fdd90d3bfde6ff8004615`. O SHA-256 da captura Windows foi `ff40cf2c2b990800ce21d49c2466d226d68c7f2b3057d1e65367b9ab9b94eeda`. A inspeção visual confirmou o tema azul-marinho, os operandos de XOR `170` e `85` e o resultado exato de 8 bits `255` em decimal e `FF` em hexadecimal. [Captura Windows](windows.png)

## Reprodução

Na raiz do repositório, use as versões fixadas de Rust e Node. O oráculo do Programador usa a biblioteca padrão do Python. Quando o Chromium do Playwright estiver indisponível, informe em `DARS_CHROME_EXECUTABLE` o executável do navegador instalado para o script offline avulso.

```powershell
cargo fmt --all -- --check
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
cargo build --locked --release -p dars-cli
node scripts/build-wasm.mjs
python -B tests/verify-programmer.py target/release/dars.exe
node tests/check-programmer-targets.mjs target/release/dars.exe
npm run build --prefix apps/web
npm test --prefix apps/web
$env:DARS_BROWSER_CHANNEL = 'chrome'
npm run test:e2e --prefix apps/web
node tests/verify-web-offline.mjs
cargo build --locked --release -p dars-desktop
node benchmarks/windows-programmer.mjs target/release/dars-desktop.exe
```
