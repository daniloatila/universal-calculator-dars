# Objetivo 02 · Revisão 01 · DARS 0.2.1

[English](REPORT.md) · [Entrega histórica 0.2.0](../REPORT.md) · [Aprovação do Objetivo 01](../../objective-01/approval.json)

O proprietário informou a avaliação independente de **88/100** para a versão 0.2.0. Esta revisão acrescenta capacidades nativas no Windows, investiga desempenho e memória, desacopla a interface operacional do Standard e estabelece limites para o agendamento. A missão original e o núcleo matemático aprovado continuam como referência. [Estado do projeto](../../../docs/pt-BR/project-state.md) · [Critérios de aceitação](acceptance.json)

## Resultados verificados

- **Sensores locais no Windows.** A interface consulta um registro estruturado e limitado de plataforma, arquitetura, processadores lógicos, memória, CPU, energia, bateria e estado nativo da janela. A CPU exige duas leituras comparáveis. Temperatura e capacidade física da GPU permaneceram indisponíveis. O teste iniciado na interface criou um contexto WebGL. [Compatibilidade](compatibility.md) · [Segurança](security.md)
- **Adaptação automática.** A minimização real mudou o perfil de Balanceado para Ultraleve, suspendeu o módulo e encerrou o worker. A propriedade do WebView2 retornou LOW. Na restauração, o ambiente voltou a NORMAL e Balanceado e o cálculo de `1/3` apresentou a expansão esperada. Em carga controlada, a CPU do sistema subiu em média 2,76 pontos percentuais. As três amostras nativas registradas levaram entre 76 e 117 µs e o IPC local levou cerca de 0,7 ms. Os testes simulados cobrem CPU, memória, energia, temperatura, gráficos e recuperação. [Medições](benchmarks.json)
- **Módulos e filas.** Dois módulos de teste usam tipos de estado diferentes na interface real. Os testes exercitaram troca, suspensão, recuperação, encerramento e limpeza geral. Seleção e ativação têm prazo de 15 s. Há uma vaga reservada para operações essenciais e interativas em todos os perfis. O Ultraleve apresenta quadros simplificados sob demanda a cada 250 ms quando necessário. [Regressão](regression.md) · [Documentação operacional](../../../docs/pt-BR/operations.md)
- **Regressão e privacidade.** Foram repetidas 576 verificações e acrescentadas 18 às suítes, além do ensaio nativo de sensores. A cobertura do núcleo Rust foi de 98,87% das linhas e 95,69% das regiões. O Windows passou 17 verificações de interface. O ensaio do Gerenciador de Credenciais removeu a entrada sintética. Os sete idiomas e o tema escuro azul-marinho padrão foram preservados. [Testes](tests.json) · [Captura do Windows](windows-operations.png)

## Desempenho e retenção

O comparativo no mesmo Windows fez duas execuções por versão em ordem espelhada. Foram conferidos 610 resultados e 234 amostras de estado nativo. A carga de 19 segundos usou a mesma sequência de expressões e ações normais do Playwright, com 101 a 104 resultados por execução. O 0.2.0 manteve o hash publicado. O 0.1.1 foi recompilado do código auditado com os 15 arquivos web idênticos aos aprovados. O hash do executável nativo recompilado difere do histórico. [Medições e proveniência](benchmarks.json) · [Protocolo](../../../benchmarks/windows-audit-021.pt-BR.md)

| Versão | p50 externo, ms | p95 externo, ms | p99 externo, ms | Inicialização até o primeiro resultado, ms |
| --- | ---: | ---: | ---: | ---: |
| 0.1.1 recompilado | 48,32–48,81 | 63,13–64,24 | 65,19–65,45 | 526,08–543,15 |
| 0.2.0 | 48,82–48,85 | 63,57–64,55 | 65,14–65,70 | 527,53–531,59 |
| 0.2.1 | 48,52–48,81 | 63,86–64,12 | 65,12–65,34 | 524,23–554,02 |

A diferença histórica de 31,88 para 48,87 ms (53,3%) veio de uma carga de 100 segundos por versão. Ela não se repetiu no comparativo pareado com duas rodadas por versão. O p50 entre clique direto e mutação conferida no DOM variou de 0,6 a 0,8 ms. Nos controles, o clique externo normal ficou entre 14,70 e 16,08 ms e o clique forçado entre 5,05 e 5,84 ms. No caminho completo, só a etapa de conferência do resultado levou de 25,24 a 27,08 ms no p50. Esses recortes mostram o efeito do acionamento e da conferência pela automação. O registro histórico não contém marcadores suficientes para atribuir a diferença antiga a um mecanismo específico do Windows ou do WebView2. O p99 observado do 0.2.1 ficou abaixo da meta de 100 ms para interações comuns. [Histórico](../benchmarks.json) · [Medições por etapa](benchmarks.json)

O parse, cálculo e preparo da saída Rust ficaram em 2,7 µs no p50 e 90,6 µs no p99. A serialização isolada de uma resposta pronta ficou em 0,1 e 2,1 µs, respectivamente. A chamada estruturada JS–WASM ficou entre 3,6 e 4,4 µs no p50. A ida e volta ao worker ficou entre 2,4 e 3,1 ms no p50. Os dois tempos de inicialização do worker no 0.2.1 foram de 26,9 e 39,1 ms. A amostra é curta para avaliar a cauda dessa partida. A restauração real até recuperar o valor salvo ficou em 39,49 e 42,99 ms. [Medições por camada](benchmarks.json)

A medição complementar correlacionou os 50 resultados do worker com o DOM em cada versão. O trecho da chegada da resposta até o DOM inclui o processamento do resultado, o agendamento do React e o commit. O quadro seguinte é um marco do renderizador. A composição gráfica e a apresentação física ficam fora desses marcadores. [Sondas do renderizador](benchmarks.json)

| Versão | Resposta do worker até o DOM p50 / p95 / p99, ms | DOM até o próximo quadro p50 / p95 / p99, ms |
| --- | ---: | ---: |
| 0.1.1 | 0,30 / 0,60 / 0,80 | 3,70 / 5,40 / 6,00 |
| 0.2.0 | 0,30 / 0,50 / 0,60 | 3,30 / 5,20 / 6,20 |
| 0.2.1 | 0,40 / 0,70 / 2,80 | 4,20 / 6,60 / 15,10 |

| Versão | Memória privada residente em repouso após carga, MiB | Residente ao minimizar, MiB | Commit privado ao minimizar, MiB |
| --- | ---: | ---: | ---: |
| 0.1.1 recompilado | 139,08–143,89 | 143,80–148,46 | 315,98–319,03 |
| 0.2.0 | 138,93–138,98 | 138,61–139,09 | 299,27–358,35 |
| 0.2.1 | 141,73–142,14 | 79,50–80,87 | 229,19–229,68 |

As faixas correspondem às medianas por fase da árvore de processos. Os 32,09 MiB adicionais no commit histórico ao minimizar se concentraram nos processos auxiliares. Nos novos ensaios do 0.2.1 minimizado, o processo do DARS manteve 4,94–5,55 MiB de commit privado e os auxiliares, 223,64–224,74 MiB. Na última amostra minimizada, o processo classificado como GPU registrou 85,82–86,12 MiB de commit privado no 0.2.1, ante 159,24–216,46 MiB no 0.2.0. O número é memória do processo. As leituras do Windows e do CDP não isolam VRAM, caches ou o alocador. O LOW do WebView2 coincidiu com a redução na minimização. Seu efeito isolado continua sem estimativa. Ao restaurar, o commit voltou a 318,54–320,70 MiB, com 101,46–101,70 MiB de memória privada residente. [Contadores por processo](benchmarks.json) · [Meta de memória do WebView2](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2_19?view=webview2-1.0.2849.39)

Quatro ciclos no mesmo processo usaram Ultraleve, Máximo, Máximo e Ultraleve, com 600 cálculos conferidos e pelo menos 28 segundos de carga por ciclo. As medianas da memória privada residente variaram de 132,82–139,46 MiB em repouso visível e de 82,00–91,11 MiB minimizado. As medianas do commit privado minimizado ficaram entre 252,42–376,20 MiB. O repouso terminou com um worker no Máximo e zero no Ultraleve. Todas as minimizações terminaram com zero workers. Após a carga, o WASM informou 1,12–1,12 MiB de memória linear e o renderizador registrou 5,79–6,95 MiB de heap JavaScript em uso em 4 de quatro pontos de medição. Cada restauração recalculou o mesmo valor salvo em 45,25–80,80 ms. Restaram zero processos descendentes após fechar. No Ultraleve, o repouso mediu 139,46 e 132,82 MiB. No Máximo, foram 136,59 e 137,15 MiB. Esses pares registram a retenção durante o intervalo medido. [Ciclos sustentados](benchmarks.json)

Nos quatro ciclos sustentados, o commit privado minimizado subiu de 252,42 para 307,36, 308,43 e 376,20 MiB. O processo do DARS se manteve entre 4,84 e 6,21 MiB. O crescimento ocorreu nos auxiliares do WebView2. A memória residente em repouso caiu entre o primeiro e o último ciclo Ultraleve. No ensaio histórico do 0.2.0, com o mesmo protocolo de ciclos em outra sessão, a última minimização registrou commit de 381,73 MiB e memória residente privada de 148,67 MiB, ante 376,20 e 91,11 MiB no 0.2.1. A redução de páginas residentes ao minimizar conviveu com a retenção de commit ao reutilizar o ambiente. A origem das alocações dentro do WebView2 e a tendência em janelas mais longas seguem indeterminadas. [Ciclos históricos](../benchmarks.json) · [Ciclos atuais](benchmarks.json)

O primeiro ensaio sustentado foi interrompido na pausa de 24 de novembro. No segundo ciclo, apenas uma de cinco amostras confirmou a janela minimizada. Ela voltou ao primeiro plano antes do comando de restauração, por motivo indeterminado. Essas amostras ficaram fora da repetição qualificada de 25 de novembro. [Estado do ensaio e dados por ciclo](benchmarks.json)

A meta de RAM incremental inferior a 100 MB no modo básico visível permanece aberta. Após o primeiro resultado e a estabilização, a árvore do 0.2.1 mediu 100,88–100,93 MiB residentes privados. As variações de RAM do sistema incluem atividade externa ao DARS. Heap JavaScript, memória linear WASM e contadores do Windows medem escopos parcialmente sobrepostos. A aplicação controla caches próprios e workers. O WebView2 administra seus caches e seu alocador, com a meta NORMAL restabelecida ao retornar. [Reprodução](reproduction.md) · [Compatibilidade](compatibility.md)

## Limites

A execução física desta revisão cobre Windows x64. A documentação de compatibilidade registra cenários de navegador, compilação e testes de outras plataformas em CI. O contrato protege a entrada nativa do WebView e os módulos embarcados são código do aplicativo. Os 25 módulos previstos poderão usar a mesma interface de registro. Os orçamentos, dependências e o tamanho dos estados de cada módulo ainda dependem de validação conforme eles forem implementados. [Compatibilidade](compatibility.md) · [Reprodução](reproduction.md)

**Estado** `READY_FOR_REVIEW`. Todos os critérios obrigatórios têm evidência registrada. O Objetivo 01 permanece `APPROVED`, o Objetivo 03 permanece `NOT_STARTED` e a versão de desenvolvimento 0.2.1 aguarda a nova auditoria independente.

[Achados](findings.json) · [Critérios](acceptance.json) · [Medições completas](benchmarks.json) · [GitHub Actions](ci.json)
