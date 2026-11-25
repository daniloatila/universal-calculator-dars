# Geometria · Verificação da etapa

[English](verification.md) · [Limites matemáticos e de recursos](limits.pt-BR.md) · [Contrato do registro de cálculo](../calculation-proof/contract.pt-BR.md) · [Plano de etapas](../PLAN.pt-BR.md) · [Registro de testes](tests.json)

Os resultados cobrem a etapa de Geometria do Objetivo 03, seus resultados exatos e simbólicos, as restrições geométricas, os registros de cálculo e as regressões dos módulos já entregues.

## Verificações locais

| Verificação | Resultado observado |
| --- | --- |
| Referência independente SymPy na CLI Windows | 159 aprovados e 0 falhas nas compilações otimizada e instrumentada, com SymPy 1.14.0. O total cobre as 11 operações, 46 rejeições estruturadas, seis reexecuções com registros de cálculo idênticos e uma verificação de procedência da entrada original. [Oráculo independente](../../../tests/verify-geometry.py) |
| CLI e WASM de Geometria | 32 respostas completas coincidiram. Quatro verificações adicionais de isolamento entre módulos passaram. [Executor de paridade](../../../tests/check-geometry-targets.mjs) |
| Testes Rust dos membros padrão do workspace | 52 aprovados no núcleo Standard (16) e no motor universal (36). A formatação Rust e o Clippy dos membros padrão passaram. |
| Testes web no Node | 65 aprovados e 0 falhas. |
| Chrome instalado no Windows | 59 aprovados na distribuição final, incluindo os sete testes de Geometria. [Observações do navegador](browser.json) · [Captura no navegador](browser.png) |
| Offline e idiomas sob demanda | 10 verificações avulsas passaram na distribuição final. O teste de Geometria no navegador também conferiu isolamento de módulos e cálculo offline. [Executor offline](../../../tests/verify-web-offline.mjs) |
| Regressões do Standard | 157 casos independentes de racionais e decimais, 20 comparações entre CLI e WASM e 291 casos de valores estruturados passaram. [Oráculo independente](../../../tests/oracle.py) · [Executor de paridade](../../../tests/check-targets.mjs) · [Oráculo estruturado](../../../crates/dars-core/tests/structured-oracle.py) |
| Regressões do Científico, Álgebra, Cálculo e Álgebra Linear | As referências independentes aprovaram, respectivamente, 177, 184, 210 e 223 casos. Entre CLI e WASM, coincidiram 19, 28, 27 e 30 registros, respectivamente. [Científico](../scientific/verification.pt-BR.md) · [Álgebra](../algebra/verification.pt-BR.md) · [Cálculo](../calculus/verification.pt-BR.md) · [Álgebra Linear](../linear-algebra/verification.pt-BR.md) |
| Cobertura de linhas | Os testes Rust instrumentados e os oráculos na CLI nativa cobriram 851/865 linhas de Geometria (98,38%), 6.829/7.047 do motor universal (96,91%) e 613/620 do núcleo Standard (98,87%). [Registro de testes](tests.json) |
| Build release com dependências fixadas no Windows | A CLI otimizada executou o oráculo independente. O release normal do aplicativo desktop concluiu a execução no WebView2 sob a política de segurança existente no Windows. [Medições Windows](windows-benchmark.json) |

A suíte independente usa coordenadas racionais exatas, uma triangulação orientada para medir polígonos e uma resolução separada de sistemas lineares para interseções de segmentos. Compara unidades lineares, quadradas e cúbicas no registro de cálculo. Também verifica quais medidas são preservadas ou alteradas por rotação, translação, reflexão e escala. Os casos de polígonos incluem uma fronteira válida com 32 vértices, uma fronteira autointersectante com área orientada diferente de zero, sobreposição de arestas adjacentes e contato entre arestas não adjacentes. Os ângulos cobrem graus, radianos, 2D, 3D e semirretas colineares admissíveis. [Oráculo independente](../../../tests/verify-geometry.py) · [Motor cartesiano](../../../crates/dars-universal/src/geometry/cartesian.rs)

A suíte focada no navegador conferiu as 11 operações, sete idiomas, entrada decimal localizada e o layout RTL árabe a 320 px. O teste de diagramas observou detalhe reduzido no perfil Ultraleve, detalhe completo no Máximo, desenho no Canvas, zero redesenhos adicionais em 280 ms de repouso e liberação do Canvas ao voltar ao Standard. O teste de registro exportou e reimportou passivamente o resultado de uma esfera, com `cm^2` para área da superfície e `cm^3` para volume. Outros casos verificaram um único WASM isolado de Geometria no cache offline, resultado após recarga offline e término de worker com recuperação da entrada após trocar de módulo. [Suíte de Geometria no navegador](../../../apps/web/tests/geometry.spec.ts)

A captura no navegador mostra o tema azul-marinho, o diagrama de segmentos em detalhe completo e o ponto exato de cruzamento `[2,2]` em centímetros. O SHA-256 da imagem é `0e8f61cd1b40cf1bede1c0bb340e775a5c548b81566bc74d1efbcb3a0403c5cc`. [Captura no navegador](browser.png)

## Verificações exatas e simbólicas representativas

| Caso | Resultado observado |
| --- | --- |
| Triângulo com lados `3 4 5` em `cm` | Perímetro `12 cm`, área `6 cm^2`, escaleno e retângulo. |
| Polígono retangular com lados adjacentes de comprimentos `10^20` e `10^-20` | Área exata `1` em unidades quadradas e orientação anti-horária. |
| Dois segmentos quase colineares com extremidades deslocadas em `10^-23` | Cruzamento próprio no ponto exato `[1/2,1/2]`. O resultado conserva a unidade das coordenadas. |
| Semirretas da origem até `(1,0,1)` e `(0,1,1)` | Ângulo simbólico exato `pi/3` com a unidade `rad` no registro. |

O oráculo confere esses resultados como números racionais ou expressões simbólicas. Os campos de precisão, tolerância e limite de erro certificado ficam nulos nos registros de cálculo. [Oráculo independente](../../../tests/verify-geometry.py) · [Contrato do registro de cálculo](../calculation-proof/contract.pt-BR.md)

## Dependências e segurança

Geometria usa os tipos de aritmética racional já presentes no Rust. Os lockfiles de Rust e npm coincidem com os da etapa aceita de Álgebra Linear. A verificação anterior registra a auditoria de dependências e a consulta ao registro oficial para as entradas adicionadas naquela etapa. Os quatro jobs de CI de Álgebra Linear passaram. O CI de Geometria inclui as referências SymPy e as comparações entre CLI e WASM, e sua execução segue a publicação do commit da etapa. [Evidência de dependências e segurança de Álgebra Linear](../linear-algebra/verification.pt-BR.md#dependências-e-segurança) · [Registro de CI de Álgebra Linear](../linear-algebra/ci.json) · [Definição do CI](../../../.github/workflows/ci.yml)

## Tempos diretos no WASM

O executor Node mediu o WASM de Geometria inicializado, incluindo a leitura da requisição no Rust e a serialização do registro de cálculo. Em 120 interações após 10 aquecimentos por expressão, p50/p95/p99 foram **0,0293 / 0,1089 / 0,1215 ms**. A inicialização levou **12,90 ms**. O WASM tinha **475.212 bytes**, com capacidade linear observada de **1.179.648 bytes**. O escalonamento pelo navegador, o início do worker e a renderização no DOM ficam fora dessa medição. O SHA-256 do WASM foi `ccc38b66a109d54e6e41d031d4920e82782b9147c6fb16f79c1c2144414d12c4`. [Executor de paridade e medição](../../../tests/check-geometry-targets.mjs) · [Registro de testes](tests.json)

## Interação e recursos no Windows

Com um perfil novo, o aplicativo desktop levou **629,05 ms** até o resultado conferido do Standard. A seleção de Geometria levou **26,12 ms** até o painel visível. Nas 36 interações conferidas com retângulos e distância cartesiana, p50/p95/p99 foram **62,96 / 76,69 / 77,52 ms**. O intervalo inclui o preenchimento dos campos da operação, o clique em Calcular, o ciclo do worker, o cálculo e a observação do resultado no DOM. Os **41** workers de Geometria observados encerraram. A minimização e restauração via Win32 preservaram os dois campos do retângulo e o resultado conferido, o Standard manteve `0.3` quando selecionado novamente e as amostras após o fechamento mostraram zero descendentes. [Executor no Windows](../../../benchmarks/windows-geometry.mjs) · [Fases medidas](windows-benchmark.json)

A execução usou Windows **10.0.26200**, WebView2 **158.0.4370.33** e 20 processadores lógicos. Cada fase teve seis amostras em cerca de cinco segundos. As colunas de memória mostram as medianas em MiB para a árvore de processos / processo DARS / auxiliares do WebView2. CPU é a taxa amostrada em relação a um processador lógico, e os workers foram contados ao fim de cada fase.

| Fase | Memória privada residente em MiB | Commit privado em MiB | CPU | Workers |
| --- | ---: | ---: | ---: | ---: |
| Standard visível | 101,20 / 3,58 / 97,63 | 236,59 / 5,20 / 231,39 | 1,23% | 1 |
| Geometria sob carga | 126,50 / 4,52 / 121,98 | 265,79 / 6,16 / 259,63 | 60,79% | 0 |
| Geometria em repouso | 148,46 / 4,52 / 143,95 | 286,55 / 6,16 / 280,39 | 0,00% | 0 |
| Geometria minimizada | 90,54 / 3,61 / 86,93 | 233,20 / 5,50 / 227,71 | 2,47% | 0 |
| Geometria restaurada | 106,04 / 4,54 / 101,50 | 337,66 / 6,18 / 331,48 | 0,00% | 0 |
| Após fechar | 0,00 / 0,00 / 0,00 | 0,00 / 0,00 / 0,00 | 0,00% | 0 |

Workers de curta duração abriram e fecharam entre os pontos finais das fases. A memória privada residente caiu durante a minimização. O maior commit privado ocorreu após a restauração e ficou concentrado no WebView2. A medição cobre um ciclo curto. A meta de 100 MB incrementais de memória física e a retenção em ciclos mais longos seguem abertas. [Dívida de memória e protocolo](../../objective-02/revision-02/memory-debt.pt-BR.md)

O SHA-256 do executável foi `8d42a87a89e725232b24caa22c227280d95c0b25b71b2b5f2c07ff2992fa963b`. O SHA-256 da captura Windows foi `f6fec694b0976cac7cd9878f53d8c845bce5df0f235d1c658ed04bb6f7f55649`. A inspeção visual confirmou o tema azul-marinho, o retângulo de `3` por `4` e os resultados exatos exibidos de área `12 u²` e perímetro `14 u`. [Captura Windows](windows.png)

## Reprodução

Na raiz do repositório, use as versões fixadas de Rust e Node e instale as referências de teste em ambiente separado. Quando o Chromium do Playwright estiver indisponível, informe em `DARS_CHROME_EXECUTABLE` o executável do navegador instalado para o script offline avulso. [Dependências do oráculo](../../../tests/math-oracle-requirements.txt)

```powershell
cargo fmt --all -- --check
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
cargo build --locked --release -p dars-cli
node scripts/build-wasm.mjs
python -m venv .tooling/math-oracle-venv
$oraclePython = '.tooling/math-oracle-venv/Scripts/python.exe'
& $oraclePython -m pip install --only-binary=:all: --require-hashes -r tests/math-oracle-requirements.txt
& $oraclePython -B tests/verify-geometry.py target/release/dars.exe
node tests/check-geometry-targets.mjs target/release/dars.exe
npm run build --prefix apps/web
npm test --prefix apps/web
$env:DARS_BROWSER_CHANNEL = 'chrome'
npm run test:e2e --prefix apps/web
node tests/verify-web-offline.mjs
cargo build --locked --release -p dars-desktop
node benchmarks/windows-geometry.mjs target/release/dars-desktop.exe
```
