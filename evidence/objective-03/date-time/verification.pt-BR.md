# Datas e Horários · Verificação da etapa

[English](verification.md) · [Modelos de calendário e limites](limits.pt-BR.md) · [Contrato do registro de cálculo](../calculation-proof/contract.pt-BR.md) · [Plano de etapas](../PLAN.pt-BR.md) · [Registro de testes](tests.json)

A verificação cobre as oito operações de Datas e Horários, o módulo isolado e offline e as regressões da calculadora Standard e das oito ferramentas avançadas já entregues.

## Verificações locais

| Verificação | Resultado observado |
| --- | --- |
| Referências independentes na CLI Windows | 403 passaram nas compilações otimizada e instrumentada. A suíte usa `datetime`, `calendar` e `zoneinfo` do Python, com os dados de fusos carregados do `tzdata` 2026.6. Inclui 143 rejeições estruturadas, 21 erros esperados em transições de fuso e oito reexecuções com registros idênticos. [Oráculo independente](../../../tests/verify-date-time.py) |
| CLI e WASM de Datas e Horários | 49 respostas completas coincidiram e oito verificações de isolamento entre módulos passaram. [Executor de paridade](../../../tests/check-date-time-targets.mjs) |
| Testes Rust dos membros padrão do workspace | 84 passaram no núcleo Standard (16) e no motor Universal (68). [Registro de testes](tests.json) |
| Node web e Chrome instalado no Windows | Os 65 testes Node e os 89 testes no Chrome passaram na distribuição final, incluindo oito testes de Datas e Horários no navegador. [Observações do navegador](browser.json) · [Captura no navegador](browser.png) |
| Offline e carregamento sob demanda | As 10 verificações avulsas passaram. O teste focado no navegador carregou isoladamente o módulo Datas e Horários sob demanda e converteu fusos após recarregar offline. [Executor offline](../../../tests/verify-web-offline.mjs) |
| Regressões até o Conversor | O núcleo Standard passou em 157 casos independentes, 20 comparações entre CLI e WASM e 291 casos estruturados. Do Científico ao Conversor, passaram 177, 184, 210, 223, 159, 289, 368 e 342 casos independentes, respectivamente. Entre CLI e WASM, coincidiram 19, 28, 27, 30, 32, 38, 36 e 46 registros completos. [Registro de testes](tests.json) |
| Cobertura de linhas | O relatório consolidado do LLVM registrou 977/980 linhas de Datas e Horários (99,69%), 10.189/10.495 do motor Universal (97,08%) e 613/620 do núcleo Standard (98,87%). [Registro de testes](tests.json) |
| Build release com dependências fixadas no Windows | A CLI otimizada executou o oráculo independente. A execução nativa no WebView2 mediu a inicialização, as interações com Datas e Horários, a restauração e o encerramento de processos. [Medições Windows](windows-benchmark.json) |

Na CLI Windows, o oráculo carrega arquivos TZif diretamente do pacote Python fixado, de forma independente da base de fusos do sistema operacional. Ele deriva datas civis, semanas ISO e contagens de dias úteis, confere instantes UTC com nanossegundos inteiros e verifica a reexecução com a entrada original e suas opções. Os casos históricos incluem as correções de São Paulo na base IANA 2026f e a transição prevista para Havana em novembro de 2026. A suíte também cobre a mudança de meia hora em Lord Howe, um dia suprimido em Apia e deslocamentos históricos de fuso com segundos. [Oráculo independente](../../../tests/verify-date-time.py) · [Versão IANA 2026f](https://www.iana.org/time-zones/releases/2026f) · [Documentação de zoneinfo do Python](https://docs.python.org/3/library/zoneinfo.html)

Os testes no navegador exercitam as oito operações, regras para dias úteis, intervalos civis com sinal, duração em nanossegundos, erros distintos para horários repetidos e suprimidos, importação passiva de um registro exportado, entradas temporárias e cancelamento de worker. Eles cobrem sete idiomas, incluindo controles RTL em árabe a 320 px, e verificam a conversão de fusos após recarregar offline. O caso de exportação e importação do registro observou zero requisições externas. [Testes de Datas e Horários no navegador](../../../apps/web/tests/date-time.spec.ts)

A captura no tema azul-marinho mostra a ocorrência anterior de `2024-11-03T01:30:00` em `America/New_York`, que corresponde a `2024-11-03T05:30:00Z` com deslocamento de origem `-04:00`. A versão IANA `2026f` e o formato `rearguard` aparecem abaixo do resultado. O SHA-256 da imagem é `b820712c61e8772bb63def49ea7d4674d06fbc491fd2db38a2a8ed122dc98b45`. [Captura no navegador](browser.png)

## Verificações representativas

| Caso | Resultado observado |
| --- | --- |
| De `2024-02-28` a `2024-03-01` | Diferença de `2` dias civis. A inversão produz `-2`. O intervalo equivalente em 1900 tem um dia pelas regras gregorianas de anos seculares. |
| De `2000-02-29` a `2023-02-28` | Idade de `23` anos, `0` meses e `0` dias, com ajuste do aniversário ao último dia do mês. |
| `2024-01-31` mais um mês | `2024-02-29` com `clamp`. A política `reject` retorna um erro de domínio para o dia 31, que não existe em fevereiro. |
| `2021-01-01` | Sexta-feira, dia ordinal `1`, semana `53` do ano semanal ISO `2020`. |
| De `2024-02-23` a `2024-03-01`, excluindo quarta-feira `2024-02-28` e segunda-feira `2024-02-26` | Três dias úteis com a regra de segunda a sexta. A inversão muda o sinal da contagem. |
| `2024-02-23` mais um dia útil, excluindo segunda-feira `2024-02-26` | `2024-02-27`. Em um teste separado, o prazo de um dia civil a partir de `2024-02-24` aponta para `2024-02-25`. |
| `2024-11-03T01:30:00` em `America/New_York` | `05:30Z` com a resolução para o instante anterior ou `06:30Z` para o posterior. Um horário suprimido na primavera retorna `nonexistent_local_time` com qualquer política. |
| `1970-01-01T00:00:00Z` seguido de `1969-12-31T23:59:59.999999999Z` | Duração exata com sinal de `-0.000000001` segundo. |

A comparação inicial do oráculo encontrou duas diferenças no indicador de horário de verão de Dublin entre janeiro e julho. O `tzdata` fixado usa a representação principal da IANA, com ajuste de −1 hora no inverno e zero no verão para esses casos. Os dados do Jiff usam a representação `rearguard`, com horário padrão no inverno e horário de verão no verão. O oráculo final compara os indicadores esperados para cada data com as regras `rearguard` publicadas. Os horários locais, os instantes UTC e os deslocamentos coincidem com a referência Python nas duas direções entre Dublin e Londres. O registro de cálculo passou a indicar a variante usada para o indicador. [Regras da IANA para Dublin e a União Europeia](https://data.iana.org/time-zones/tzdb-2026f/europe) · [Formato de dados do Jiff](https://docs.rs/jiff-tzdb/1.0.0/jiff_tzdb/) · [Oráculo independente](../../../tests/verify-date-time.py)

## Dependências e segurança

Datas e Horários usa Jiff `1.0.3` e `jiff-tzdb` `1.0.0` com a base IANA 2026f embarcada. O pacote Python `tzdata`, usado nos testes, está fixado na versão `2026.6` com hash SHA-256. As operações recebem datas e opções explícitas. As conversões entre fusos usam a base embarcada offline, e os calendários personalizados de dias úteis usam os dias da semana e os feriados informados. [Configuração de dependências Rust](../../../crates/dars-universal/Cargo.toml) · [Requisitos do oráculo](../../../tests/math-oracle-requirements.txt) · [Modelos de calendário e limites](limits.pt-BR.md)

A varredura RustSec registrou zero vulnerabilidades entre 443 entradas fixadas e três avisos já conhecidos para `chrono` (sem manutenção), `proc-macro-error` (sem manutenção) e `glib` (problema de segurança de memória). O lockfile conserva `chrono` pela resolução opcional de `serde_with`. As árvores selecionadas do `dars-desktop` em todos os alvos e do WASM de Datas e Horários excluem `chrono`. O CI inclui referências independentes e verificações de paridade. [Registro de testes](tests.json) · [Definição do CI](../../../.github/workflows/ci.yml)

## Tempos diretos no WASM

O executor Node mediu o WASM de Datas e Horários inicializado, incluindo a leitura da requisição no Rust e a serialização do registro de cálculo. Em 120 interações após 10 aquecimentos por expressão, p50/p95/p99 foram **0,0195 / 0,0383 / 0,0620 ms**. A inicialização levou **14,38 ms**. O WASM tinha **556.597 bytes**, com capacidade linear observada de **1.441.792 bytes**. O escalonamento pelo navegador, o início do worker e a renderização no DOM ficam fora dessa medição. O SHA-256 do WASM foi `4c81d033f8d451a3afdc907a19946fed731cc3bb7bb44adb60fd7b27244ccd5b`. [Executor de paridade e medição](../../../tests/check-date-time-targets.mjs) · [Registro de testes](tests.json)

## Interação e recursos no Windows

O build release com dependências fixadas rodou no Windows `10.0.26200` com WebView2 `158.0.4370.33`. Da inicialização ao resultado conferido no Standard, passaram **604,56 ms**. A seleção de Datas e Horários levou **29,96 ms**. Em **39 interações sustentadas**, p50/p95/p99 foram **61,41 / 71,09 / 71,90 ms**. Cada interação medida preencheu datas e opções, acionou o worker e conferiu o resultado no DOM. A carga cobriu diferenças de dias gregorianos, adição de um mês com ajuste e uma conversão de São Paulo para Catmandu que preservou o nanossegundo em `2026-07-01T12:00:00.000000001`. O executável tinha 13.606.912 bytes e SHA-256 `cf18604382b8ad7fb0209134d9da07332c4bfe4fcc8af1f4f1dfecce096d8f6b`. [Executor no Windows](../../../benchmarks/windows-date-time.mjs) · [Fases medidas](windows-benchmark.json)

Os 45 workers abertos foram encerrados. Após minimizar e restaurar via Win32, os dois campos de data e o resultado conferido estavam preservados. Ao retornar ao Standard, o resultado `0.3` estava preservado. A árvore de processos tinha zero descendentes 23,44 ms após o encerramento do processo principal e nas seis amostras finais. [Fases medidas](windows-benchmark.json)

| Fase | Memória privada residente da árvore (MiB) | Memória privada comprometida da árvore (MiB) |
| --- | ---: | ---: |
| Standard visível | 102,08 | 238,03 |
| Carga de Datas e Horários | 132,27 | 272,26 |
| Datas e Horários ocioso | 167,10 | 305,62 |
| Minimizado | 93,58 | 266,39 |
| Restaurado | 109,90 | 302,88 |
| Após o fechamento | 0,00 | 0,00 |

Cada linha é a mediana de seis amostras coletadas a cerca de um segundo de distância. A memória privada residente caiu na minimização. Na fase ociosa, que teve a maior mediana de memória privada comprometida, os processos auxiliares responderam por 299,94 MiB. A meta em aberto de menos de 100 MB de RAM incremental no modo Standard visível e a retenção em ciclos mais longos exigem avaliações próprias. A captura desktop mostra o intervalo exato de dois dias de `2024-02-28` a `2024-03-01` no tema azul-marinho padrão. O SHA-256 da imagem é `132d4ed4548558336562e1d77c050feb673d21c9499fee9044ea07eae72e92ac`. [Fases medidas](windows-benchmark.json) · [Captura Windows](windows.png) · [Dívida de memória e protocolo](../../objective-02/revision-02/memory-debt.pt-BR.md)

## Reprodução

Na raiz do repositório, use as versões fixadas de Rust e Node e instale as referências de teste em ambiente separado. Quando o Chromium do Playwright estiver indisponível, informe em `DARS_CHROME_EXECUTABLE` o executável do navegador instalado para o script offline avulso. [Requisitos do oráculo](../../../tests/math-oracle-requirements.txt)

```powershell
cargo fmt --all -- --check
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
cargo build --locked --release -p dars-cli
node scripts/build-wasm.mjs
python -m venv .tooling/math-oracle-venv
$oraclePython = '.tooling/math-oracle-venv/Scripts/python.exe'
& $oraclePython -m pip install --only-binary=:all: --require-hashes -r tests/math-oracle-requirements.txt
& $oraclePython -B tests/verify-date-time.py target/release/dars.exe
node tests/check-date-time-targets.mjs target/release/dars.exe
npm run build --prefix apps/web
npm test --prefix apps/web
$env:DARS_BROWSER_CHANNEL = 'chrome'
npm run test:e2e --prefix apps/web
node tests/verify-web-offline.mjs
cargo build --locked --release -p dars-desktop
node benchmarks/windows-date-time.mjs target/release/dars-desktop.exe
```
