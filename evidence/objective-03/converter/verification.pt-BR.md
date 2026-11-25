# Conversor · Verificação da etapa

[English](verification.md) · [Unidades, métodos e limites de recursos](limits.pt-BR.md) · [Contrato do registro de cálculo](../calculation-proof/contract.pt-BR.md) · [Plano de etapas](../PLAN.pt-BR.md) · [Registro de testes](tests.json)

Os resultados cobrem a etapa Conversor do Objetivo 03, incluindo conversões exatas e simbólicas de unidades, arredondamento nominal, câmbio manual, datas de cotação e regressões dos módulos já entregues.

## Verificações locais

| Verificação | Resultado observado |
| --- | --- |
| Referências independentes na CLI Windows | 342 aprovados e 0 falhas nas compilações otimizada e instrumentada com `Fraction`, `Decimal` e SymPy 1.14.0. A suíte inclui unidades canônicas e seus aliases suportados, 68 rejeições estruturadas e oito reexecuções com registros idênticos. [Oráculo independente](../../../tests/verify-converter.py) |
| CLI e WASM do Conversor | 46 respostas completas coincidiram. Sete verificações adicionais de isolamento entre módulos passaram. [Executor de paridade](../../../tests/check-converter-targets.mjs) |
| Testes Rust dos membros padrão do workspace | 75 aprovados no núcleo Standard (16) e no motor universal (59). |
| Testes web no Node | 65 aprovados e 0 falhas. |
| Chrome instalado no Windows | 81 aprovados na distribuição final, incluindo os sete testes do Conversor. [Observações do navegador](browser.json) · [Captura no navegador](browser.png) |
| Offline e idiomas sob demanda | 10 verificações avulsas passaram na distribuição final. O teste do Conversor no navegador também conferiu o isolamento de módulos e o cálculo de câmbio manual offline. [Executor offline](../../../tests/verify-web-offline.mjs) |
| Regressões do Standard | 157 casos independentes de racionais e decimais, 20 comparações entre CLI e WASM e 291 casos de valores estruturados passaram. [Oráculo independente](../../../tests/oracle.py) · [Executor de paridade](../../../tests/check-targets.mjs) · [Oráculo estruturado](../../../crates/dars-core/tests/structured-oracle.py) |
| Módulos avançados anteriores | As referências do Científico ao Programador passaram em 177, 184, 210, 223, 159, 289 e 368 casos. Entre CLI e WASM, coincidiram 19, 28, 27, 30, 32, 38 e 36 registros, respectivamente. [Científico](../scientific/verification.pt-BR.md) · [Álgebra](../algebra/verification.pt-BR.md) · [Cálculo](../calculus/verification.pt-BR.md) · [Álgebra Linear](../linear-algebra/verification.pt-BR.md) · [Geometria](../geometry/verification.pt-BR.md) · [Matemática Discreta](../discrete-mathematics/verification.pt-BR.md) · [Programador](../programmer/verification.pt-BR.md) |
| Cobertura de linhas | O relatório bruto consolidado do LLVM registrou 742/799 linhas do Conversor (92,87%), 9.198/9.501 do motor universal (96,81%) e 613/620 do núcleo Standard (98,87%). [Registro de testes](tests.json) |
| Build release com dependências fixadas no Windows | A CLI otimizada executou o oráculo independente. O teste desktop mediu inicialização, interação com o Conversor, restauração e encerramento dos workers e processos no WebView2. [Medições Windows](windows-benchmark.json) |

O oráculo deriva unidades compostas a partir das definições de base, usa inversas racionais dentro de famílias exatas compatíveis e verifica independentemente as expressões simbólicas de ângulos. Também confere prefixos decimais e binários, as 17 categorias físicas, temperaturas absolutas perto de zero kelvin, diferenças de temperatura com sinal e conversões recíprocas de combustível. Os casos de câmbio manual usam taxas sintéticas e comparações independentes de datas gregorianas. [Oráculo independente](../../../tests/verify-converter.py) · [Brochura do SI do BIPM](https://www.bipm.org/en/publications/si-brochure) · [Fatores de conversão do NIST](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors) · [Prefixos binários do NIST](https://pml.nist.gov/cuu/Units/binary.html)

Os testes focados no navegador exercitaram as 17 categorias físicas, mensagens de domínio, troca de unidades, sete idiomas e um layout RTL árabe acessível a 320 px. O teste de câmbio manual usou uma fonte com aparência de URL como texto literal e observou zero requisições externas ao conferir os quatro estados de validade. Outros casos verificaram importação passiva de um registro manual com todas as datas, carregamento isolado do WASM do Conversor, câmbio manual após recarregar offline e cancelamento de worker com recuperação da entrada. [Testes do Conversor no navegador](../../../apps/web/tests/converter.spec.ts)

O relatório de linhas do LLVM aponta 37 linhas sem cobertura em sete funções auxiliares usadas para construir a tabela de unidades durante a compilação. São `Ratio::{times,over,power}` e `Entry::{linear,affine,angle,fuel}`. Os testes em execução exercitam a tabela resultante. Excluídas apenas essas 37 linhas do denominador, a cobertura no recorte de execução é 742/762 (97,38%). [Registro de unidades](../../../crates/dars-universal/src/converter/units.rs) · [Registro de testes](tests.json)

A captura no navegador mostra o tema azul-marinho e o exemplo sintético de `25 USD` → `125 BRL`, marcado como expirado na data de referência `2024-02-01`. A fonte e as datas aparecem junto ao resultado. O SHA-256 da imagem é `5ff2a7919d2d7cbf9276af4bc8e86a71cd84f6de4d24e9f2b0270c5cd3623777`. [Captura no navegador](browser.png)

## Verificações representativas de conversão e cotação

| Caso | Resultado observado |
| --- | --- |
| `1 in` para `cm` | `127/50` exato. As unidades usuais ao quadrado e ao cubo foram conferidas com escalas de área e volume derivadas de forma independente. |
| `180 deg` para `rad` | `pi` simbólico. O sentido inverso aceita radianos racionais e retorna a expressão exata envolvendo `1/pi`. |
| `-273.149999999999999999999999 degC` para `K` | `10^-24 K` exato. Um valor à mesma distância abaixo do zero absoluto retorna erro de domínio. |
| `1 mmHg` para `Pa` | `133.3224` aproximado, com sete algarismos significativos, campo estruturado de arredondamento para o par em empates e limite de erro certificado nulo. As referências decimais independentes também conferiram empates. |
| `8 L/100km` para `km/L` | Resultado recíproco exato `25/2`. Uma entrada zero na conversão recíproca retorna erro de domínio. |
| Cotação sintética de `USD` para `BRL` datada de `2024-02-29` com término em `2024-03-03` | O produto exato pela taxa informada permanece disponível. Na data de referência `2024-03-03` a cotação está dentro da validade e em `2024-03-04` está expirada. O registro conserva o valor e o estado de validade. |

O navegador e a CLI usam a mesma aritmética. O resultado de câmbio registrado representa o produto pela taxa informada manualmente e sua validade na data de referência escolhida. [Oráculo independente](../../../tests/verify-converter.py) · [Implementação do câmbio manual](../../../crates/dars-universal/src/converter/currency.rs)

## Dependências e segurança

O Conversor usa os tipos racionais Num já presentes e um registro de unidades com limites. Os lockfiles de Rust e npm coincidem com os da etapa aceita do Programador. A operação de câmbio manual funciona offline e mantém o texto de origem e as datas no registro de cálculo local. O CI inclui a referência independente de conversões e a verificação de paridade, e sua execução segue a publicação do commit da etapa. [Limites da requisição e do registro](../../../crates/dars-universal/src/lib.rs) · [Definição do CI](../../../.github/workflows/ci.yml)

## Tempos diretos no WASM

O executor Node mediu o WASM do Conversor inicializado, incluindo a leitura da requisição no Rust e a serialização do registro de cálculo. Em 120 interações após 10 aquecimentos por expressão, p50/p95/p99 foram **0,0181 / 0,0315 / 0,0701 ms**. A inicialização levou **12,13 ms**. O WASM tinha **349.947 bytes**, com capacidade linear observada de **1.179.648 bytes**. O escalonamento pelo navegador, o início do worker e a renderização no DOM ficam fora dessa medição. O SHA-256 do WASM foi `11b22623e6cb3397874641f3bf0a783e4cc8b684bc4c2b630315e08e6d2d2265`. [Executor de paridade e medição](../../../tests/check-converter-targets.mjs) · [Registro de testes](tests.json)

## Interação e recursos no Windows

O build release com dependências fixadas rodou no Windows `10.0.26200` com WebView2 `158.0.4370.33`. A inicialização levou **606,88 ms**, e a seleção do Conversor levou **31,66 ms**. Em **43 interações sustentadas**, p50/p95/p99 foram **64,35 / 66,37 / 81,21 ms**. A carga selecionou categoria e unidades, preencheu o valor, acionou o worker e conferiu o resultado no DOM para conversões exatas de comprimento e para a conversão de Celsius em Fahrenheit. O SHA-256 do executável foi `fd965a0eafb37cabc1e490da550b372c6ebb576968637523836847b71f7d22f9`. [Executor no Windows](../../../benchmarks/windows-converter.mjs) · [Fases medidas](windows-benchmark.json)

Os 48 workers abertos pelo benchmark foram encerrados. Após minimizar e restaurar via Win32, o aplicativo preservou a categoria, as duas unidades, o valor e o resultado conferido. Ao retornar ao Standard, o resultado `0.3` estava preservado. A fase de fechamento concluída registrou zero descendentes. [Fases medidas](windows-benchmark.json)

| Fase | Memória privada residente da árvore (MiB) | Memória privada comprometida da árvore (MiB) |
| --- | ---: | ---: |
| Standard visível | 100,20 | 235,75 |
| Carga do Conversor | 125,99 | 262,22 |
| Conversor ocioso | 156,41 | 289,69 |
| Minimizado | 87,56 | 243,25 |
| Restaurado | 107,58 | 337,51 |
| Após o fechamento | 0,00 | 0,00 |

Cada linha é a mediana de seis amostras em uma fase curta. A memória privada residente caiu na minimização. A maior memória privada comprometida ocorreu após a restauração, com 331,64 MiB em processos auxiliares. A meta de 100 MB para memória desktop e a retenção em ciclos mais longos seguem em aberto. A captura mostra `1.25 m` → `125 cm` no tema azul-marinho padrão. O SHA-256 da imagem é `35946ef5ea41e9c57ecd949584967873e1ea40b79ae68d068570c0c4c4624e1c`. [Fases medidas](windows-benchmark.json) · [Captura Windows](windows.png) · [Dívida de memória e protocolo](../../objective-02/revision-02/memory-debt.pt-BR.md)

A primeira tentativa chegou à restauração e encontrou um erro de leitura na primeira captura de processos após o fechamento. Um inventário posterior encontrou zero descendentes do aplicativo e do perfil. O executor agora espera até cinco segundos para observar zero descendentes após o encerramento do processo principal, depois coleta as seis amostras de fechamento. Um descendente persistente ainda provoca falha. A reexecução bem-sucedida usou o mesmo executável e as mesmas configurações de segurança do Windows. [Executor de benchmark do Windows](../../../benchmarks/windows-tool.mjs)

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
& $oraclePython -B tests/verify-converter.py target/release/dars.exe
node tests/check-converter-targets.mjs target/release/dars.exe
npm run build --prefix apps/web
npm test --prefix apps/web
$env:DARS_BROWSER_CHANNEL = 'chrome'
npm run test:e2e --prefix apps/web
node tests/verify-web-offline.mjs
cargo build --locked --release -p dars-desktop
node benchmarks/windows-converter.mjs target/release/dars-desktop.exe
```
