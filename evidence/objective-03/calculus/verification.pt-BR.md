# Cálculo · Verificação da etapa

[English](verification.md) · [Limites matemáticos e de recursos](limits.pt-BR.md) · [Contrato do registro de cálculo](../calculation-proof/contract.pt-BR.md) · [Plano de etapas](../PLAN.pt-BR.md) · [Registro de testes](tests.json)

Os resultados cobrem a etapa de Cálculo do Objetivo 03, suas interações com os módulos Standard, Científico e Álgebra e o registro de cálculo.

## Verificações locais

| Verificação | Resultado observado |
| --- | --- |
| Referências matemáticas independentes na CLI otimizada para Windows | 210 aprovados e 0 falhas com SymPy 1.14.0 e mpmath 1.3.0. O total cobre as seis operações, 60 rejeições estruturadas, seis reexecuções com registros completos e um caso de procedência da entrada original. [Oráculo](../../../tests/verify-calculus.py) |
| CLI e WASM de Cálculo | 27 respostas completas coincidiram, com duas verificações adicionais de isolamento entre módulos e zero falhas. [Executor de paridade](../../../tests/check-calculus-targets.mjs) |
| Testes Rust dos membros padrão do workspace | 38 aprovados no núcleo Standard (16) e no motor universal (22). |
| Testes web no Node | 65 aprovados e 0 falhas. |
| Chrome instalado no Windows | 45 aprovados, incluindo os seis testes de Cálculo. [Observações do navegador](browser.json) · [Captura no navegador](browser.png) |
| Offline e idiomas sob demanda | 10 checagens avulsas passaram. O teste de Cálculo no navegador também verificou isolamento do cache e cálculo offline. [Executor offline](../../../tests/verify-web-offline.mjs) |
| Regressões do Standard | 157 casos independentes de racionais e decimais, 20 comparações entre CLI e WASM e 291 casos de valores estruturados passaram. [Oráculo independente](../../../tests/oracle.py) · [Executor de paridade](../../../tests/check-targets.mjs) · [Oráculo estruturado](../../../crates/dars-core/tests/structured-oracle.py) |
| Regressões do Científico | O oráculo geral SymPy/mpmath passou em 102 casos e o oráculo complexo do mpmath passou em 75. Entre CLI e WASM, 19 registros coincidiram e uma verificação de isolamento passou. [Oráculos do Científico](../../../tests/verify-scientific.py) · [Referência complexa](../../../tests/verify-scientific-complex.py) · [Executor de paridade](../../../tests/check-scientific-targets.mjs) |
| Regressões de Álgebra | A referência independente SymPy passou em 184 casos. Entre CLI e WASM, 28 registros coincidiram e uma verificação de isolamento passou. [Oráculo de Álgebra](../../../tests/verify-algebra.py) · [Executor de paridade](../../../tests/check-algebra-targets.mjs) |
| Cobertura de linhas | Os testes unitários Rust e os oráculos na CLI nativa instrumentada cobriram 1.777/1.839 linhas de Cálculo (96,63%), 5.032/5.223 do motor universal (96,34%) e 613/620 do núcleo Standard (98,87%). [Registro de testes](tests.json) |
| Build release com dependências fixadas no Windows | A CLI otimizada e o build normal do aplicativo desktop compilaram sob a política de segurança existente no Windows. A CLI executou o oráculo independente e o desktop concluiu a verificação nativa no WebView2. [Medições Windows](windows-benchmark.json) |

O oráculo da CLI confere 27 derivadas, 15 antiderivadas por diferenciação, 23 integrais definidas, 39 limites, 20 expansões de Taylor e 19 integrais numéricas. Os casos exatos incluem cancelamentos que preservam o domínio original, limites de descontinuidades removíveis, limites laterais distintos, comportamento no infinito e raios exatos nos exemplos de Taylor suportados. As rejeições incluem um intervalo fechado com polo, um pico estreito fora da faixa admitida pela quadratura e um caso em que a aritmética binary64 não alcançou a tolerância solicitada. [Oráculo](../../../tests/verify-calculus.py)

Os testes no navegador exercitam as seis operações, sete idiomas, parâmetros numéricos localizados e o layout RTL árabe a 320 px. A suíte confere o registro numérico estruturado por download e importação local passiva. O registro inclui resultado, tolerância e estimativa não certificada, com campo de limite de erro certificado nulo. O teste offline observa o cache de módulos avançados vazio na abertura, apenas o WASM de Cálculo após o primeiro cálculo e uma derivada conferida após recarregar offline. O teste do worker troca de módulo durante o processamento, verifica o encerramento e confere a recuperação da entrada. [Testes de Cálculo no navegador](../../../apps/web/tests/calculus.spec.ts) · [Testes compartilhados do registro de cálculo](../../../apps/web/tests/calculation-proof.spec.ts)

A captura no navegador mostra o tema azul-marinho e o resultado gaussiano aproximado `0.746824132812621` com tolerância `1e-9`. A interface identifica a estimativa como não certificada. O SHA-256 da imagem é `c289e92300a8f4a799aa22a16cc795581b6c33018453c9fcf561e1700121045e`. [Captura no navegador](browser.png)

Os lockfiles de Rust e npm coincidem com os da etapa aceita de Álgebra. O parser aplica sua gramática limitada à entrada canônica e conserva o texto exibido para registrar a origem. As verificações anteriores documentam as auditorias de segurança e os limites aplicáveis à execução local. Os quatro jobs de CI de Álgebra passaram. O CI de Cálculo inclui o oráculo independente e a verificação de paridade, e sua execução segue a publicação do commit da etapa. [Limites da requisição de cálculo](../../../crates/dars-universal/src/lib.rs) · [Evidência de segurança de Álgebra](../algebra/verification.pt-BR.md#verificações-locais) · [Registro de CI de Álgebra](../algebra/ci.json) · [Definição do CI](../../../.github/workflows/ci.yml)

## Verificações independentes da quadratura

Os resultados da CLI otimizada abaixo correspondem ao intervalo [0, 1]. As referências independentes foram avaliadas com 85 dígitos decimais. As estimativas registradas são diagnósticos do método de Simpson adaptativo. Os erros observados são as diferenças entre os resultados retornados e as referências independentes para essas entradas. O limite de erro certificado permanece nulo no registro de cálculo. [Oráculo](../../../tests/verify-calculus.py) · [Implementação da quadratura](../../../crates/dars-universal/src/calculus/numeric.rs)

| Integrando | Tolerância solicitada | Resultado observado | Erro absoluto observado | Estimativa não certificada registrada |
| --- | ---: | ---: | ---: | ---: |
| `exp(-x^2)` | `1e-10` | `0,746824132812499` | `7,19746005326e-14` | `2,905442420218322e-11` |
| `cos(25.132741228718345*x)` | `1e-9` | `-3,729655473350135e-17` | `1,18027363206e-18` | `2,2233699760844715e-10` |

As referências são `sqrt(pi)*erf(1)/2` para a função gaussiana e `sin(k)/k` para `cos(k*x)`. O argumento do cosseno abrange quase quatro ciclos completos. As cinco amostras usadas por um painel de Simpson e suas duas metades arredondam para `1,0` com 16 algarismos significativos. A implementação subdivide os painéis iniciais usando intervalos racionais para os argumentos trigonométricos, e o resultado observado coincide com a integral próxima de zero dentro da tolerância solicitada.

## Tempos diretos no WASM

O executor Node mediu o WASM inicializado, incluindo a leitura da requisição no Rust e a serialização do registro. Em 120 interações medidas após 10 aquecimentos por expressão, p50/p95/p99 foram **0,0444 / 0,1487 / 0,1906 ms**. A inicialização levou **17,09 ms**. O artefato WASM tinha **612.178 bytes** e a capacidade linear observada era de **1.179.648 bytes**. A criação do worker, o escalonamento e a renderização no DOM estão fora desses tempos. O SHA-256 do WASM foi `419b3355b3e2695a91c484bed1dd3bcab2a77c29176a52628ac8bebf0429cbce`. [Executor de paridade e medição](../../../tests/check-calculus-targets.mjs) · [Registro de testes](tests.json)

## Interação e recursos no Windows

O aplicativo desktop abriu com um perfil novo e levou **567,71 ms** até o resultado conferido do Standard. A seleção de Cálculo levou **27,61 ms** até o painel visível. Nas 40 interações conferidas com uma derivada, uma integral definida e um limite de descontinuidade removível, p50/p95/p99 foram **54,60 / 63,27 / 63,77 ms**. O intervalo inclui as ações do Playwright, o ciclo do worker, o cálculo e a observação do resultado no DOM. Os **46** workers de Cálculo observados encerraram. O ciclo de minimização e restauração via Win32 preservou entrada e resultado de Cálculo, o Standard manteve `0.3` quando selecionado novamente e as amostras após o fechamento mostraram zero processos descendentes. [Executor no Windows](../../../benchmarks/windows-calculus.mjs) · [Fases medidas](windows-benchmark.json)

A execução usou Windows **10.0.26200**, WebView2 **158.0.4370.33** e 20 processadores lógicos. Cada fase teve seis amostras em cerca de cinco segundos. As colunas de memória mostram as medianas em MiB para a árvore de processos / processo DARS / auxiliares do WebView2. CPU é a taxa amostrada em relação a um processador lógico, e os workers foram contados ao fim de cada fase.

| Fase | Memória privada residente em MiB | Commit privado em MiB | CPU | Workers |
| --- | ---: | ---: | ---: | ---: |
| Standard visível | 100,11 / 4,04 / 96,06 | 235,55 / 5,61 / 229,94 | 2,15% | 1 |
| Cálculo sob carga | 120,67 / 4,18 / 116,49 | 264,07 / 6,42 / 257,66 | 62,99% | 0 |
| Cálculo em repouso | 144,95 / 4,18 / 140,77 | 281,98 / 6,42 / 275,56 | 0,00% | 0 |
| Cálculo minimizado | 90,28 / 4,18 / 86,09 | 247,08 / 6,42 / 240,66 | 3,38% | 0 |
| Cálculo restaurado | 106,22 / 4,19 / 102,04 | 327,57 / 6,42 / 321,16 | 0,00% | 0 |
| Após fechar | 0,00 / 0,00 / 0,00 | 0,00 / 0,00 / 0,00 | 0,00% | 0 |

Workers de curta duração abriram e fecharam entre os pontos finais das fases. A memória privada residente caiu durante a minimização. A restauração registrou o maior commit privado da execução, concentrado no WebView2. A medição cobre um ciclo curto. A meta de 100 MB incrementais e a retenção em ciclos mais longos seguem abertas. [Dívida de memória e protocolo](../../objective-02/revision-02/memory-debt.pt-BR.md)

O SHA-256 do executável foi `38e9ef1df9196bc3aa626fd72a53d683176ae0137f83ad1e939ae506c8e6659f`. O SHA-256 da captura Windows foi `e4f508d9849be44319070b468cfe8ea5e03f09cbfb176986e686511301cb28e4`. A inspeção visual confirmou o tema azul-marinho, a integral definida de `x^2` de `0` a `1` e o resultado exato `1/3` com o registro de cálculo recolhido. [Captura Windows](windows.png)

## Reprodução

Na raiz do repositório, use as versões fixadas de Rust e Node e instale as dependências matemáticas de teste com hashes. Para o script offline avulso, informe em `DARS_CHROME_EXECUTABLE` o executável do navegador instalado se o Chromium do Playwright estiver indisponível. [Requisitos do oráculo](../../../tests/math-oracle-requirements.txt)

```powershell
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
cargo build --locked --release -p dars-cli
node scripts/build-wasm.mjs
python -m venv .tooling/math-oracle-venv
$oraclePython = '.tooling/math-oracle-venv/Scripts/python.exe'
& $oraclePython -m pip install --only-binary=:all: --require-hashes -r tests/math-oracle-requirements.txt
& $oraclePython -B tests/verify-calculus.py target/release/dars.exe
node tests/check-calculus-targets.mjs target/release/dars.exe
npm run build --prefix apps/web
npm test --prefix apps/web
$env:DARS_BROWSER_CHANNEL = 'chrome'
npm run test:e2e --prefix apps/web
node tests/verify-web-offline.mjs
cargo build --locked --release -p dars-desktop
node benchmarks/windows-calculus.mjs target/release/dars-desktop.exe
```
