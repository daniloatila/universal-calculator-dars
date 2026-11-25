# Objetivo 03 · Dívida de memória do desktop Windows

[English](memory-debt.md) · [Relatório integrado](REPORT.pt-BR.md) · [Registro de benchmarks](benchmarks.json) · [Observações pareadas](paired-windows.json)

**Estado** Em aberto. A meta do modo básico visível é inferior a **100.000.000 bytes** de memória física incremental, cerca de **95,37 MiB**. Na auditoria do Objetivo 02, a memória privada comprometida dos auxiliares WebView2 cresceu nos quatro ciclos medidos. A meta física incremental e a origem das alocações ficaram sem verificação. O Objetivo 03 amplia o acompanhamento com trocas reais de módulos e encerramento de workers. [Protocolo aceito da dívida](../objective-02/revision-02/memory-debt.pt-BR.md) · [Meta original](../../PROJECT_SPEC.md)

## O que os contadores medem

| Contador | Interpretação |
| --- | --- |
| Privada residente da árvore | Páginas privadas residentes do processo principal e da árvore WebView2. As colunas de processo principal e auxiliares atribuem os contadores por papel. |
| Privada comprometida da árvore | Memória virtual privada comprometida. As páginas podem estar residentes ou paginadas. O compromisso pode crescer enquanto as páginas privadas residentes diminuem. |
| Conjunto residente compartilhado agregado | Soma dos mapeamentos compartilhados e residentes de cada processo. Uma página física mapeada por mais de um processo pode aparecer várias vezes. O conjunto residente total soma as páginas privadas residentes e os mapeamentos compartilhados. |
| Variação física do sistema contra o ambiente | Mudança observada no uso de memória de todo o sistema em relação à fase ambiental. Inclui atividade fora do DARS e pode variar de forma independente dos contadores do aplicativo. |

A meta se refere à memória física incremental atribuída ao aplicativo. A comparação ambiental pareada e a memória privada residente da árvore oferecem observações complementares. A atribuição física total também requer identificar páginas compartilhadas. [Definições dos contadores](../../benchmarks/windows-desktop.pt-BR.md) · [Executor pareado](../../benchmarks/windows-objective-03.mjs)

## Comportamento medido

As nove execuções de etapa no Windows usaram perfis novos do WebView2 e mediram Standard, ativação e carga do módulo, ociosidade, minimização, restauração e fechamento. A etapa 9 mediu **102,08 MiB** de memória privada residente da árvore no Standard visível e **93,58 MiB** com Datas e Horários minimizado. A mediana de memória privada comprometida na fase ociosa de Datas e Horários foi **305,62 MiB**. Os **45** workers abertos foram encerrados e as últimas seis amostras registraram zero descendentes. Cada carga de etapa tem seu próprio código e executável identificados. [Medições da etapa 9](date-time/windows-benchmark.json) · [Índice das etapas](REPORT.pt-BR.md#validação-dos-módulos)

A execução pareada usou o executável 0.2.2 arquivado, SHA-256 `8c0ca0ee530edc836f1cfbaef646d015cd40b79a231f89a0bb3838d7a0d5d96e`, e o 0.3.0 integrado, SHA-256 `8c2da09e07fa9e5a95bf3e068105b63a2e1e860582fb371dcc0bd4ace4db3d88`. Ambos rodaram no Windows `10.0.26200` com WebView2 `158.0.4370.33`, perfil novo e as mesmas 12 interações conferidas no Standard. Cada fase Standard teve seis amostras coletadas a cerca de um segundo de distância. [Identificação do artefato de base](../objective-02/revision-02/tests.json) · [Observações pareadas](paired-windows.json)

| Build e fase do Standard | Privada residente da árvore (bytes) | Privada comprometida da árvore (MiB) | Comprometida do processo principal / auxiliares (MiB) | Conjunto compartilhado residente agregado (bytes) | Variação física do sistema contra o ambiente próprio (bytes) |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0.2.2 primeiro resultado visível | 106.164.224 | 235,65 | 5,58 / 230,07 | 285.483.008 | 163.573.760 |
| 0.3.0 primeiro resultado visível | 103.645.184 | 237,61 | 6,46 / 231,14 | 290.254.848 | 173.662.208 |
| 0.2.2 ocioso visível | 118.501.376 | 241,53 | 5,58 / 235,95 | 286.662.656 | 177.098.752 |
| 0.3.0 ocioso visível | 116.477.952 | 248,10 | 6,46 / 241,64 | 291.573.760 | 186.003.456 |

No candidato, as medianas privadas residentes do Standard visível foram 98,84 MiB após o primeiro resultado e 111,08 MiB em repouso. As medianas privadas residentes do processo principal e dos auxiliares em repouso foram 4,46 e 106,62 MiB. A árvore mediu 78,58 MiB privados residentes e 203,18 MiB privados comprometidos na minimização, e 94,16 e 251,84 MiB na restauração. As somas dos conjuntos residentes totais no primeiro resultado e em repouso foram 393.842.688 e 408.055.808 bytes. Essas somas incluem mapeamentos compartilhados repetidos. A variação do sistema inclui atividade fora do aplicativo. A meta física incremental segue sem verificação por essa medição. [Medianas pareadas por fase e papel](paired-windows.json)

O candidato ampliou o teste com cinco ciclos mistos nos perfis Ultraleve, Eficiência, Equilibrado, Desempenho e Máximo, usando Programador, Cálculo, Datas e Horários, Álgebra Linear e Científico. Os ciclos preservaram a entrada e o resultado na restauração. As fases minimizadas registraram zero workers e medianas de memória privada comprometida da árvore de 308,66, 324,85, 332,83, 326,25 e 320,20 MiB, respectivamente. Essas fases usam módulos diferentes e deixam em aberto a tendência sob uma carga idêntica. Durante as trocas, 31 workers abriram e 31 fecharam, com pico de um. O último registro Standard de `46/2` permaneceu disponível após as trocas. Ambos os builds tiveram seis amostras finais com zero descendentes. [Fases e recuperação pareadas](paired-windows.json) · [Captura nativa](standard-proof-windows.png)

As tentativas encontraram três problemas no executor. A primeira tinha um seletor ambíguo no campo de Cálculo. A seguinte concluiu os cinco ciclos mistos e exigiu zero workers imediatamente após reativar o Standard, que pode iniciar seu próprio worker. O procedimento final confere o resultado preservado e a identidade de um eventual worker do Standard, suspende explicitamente o módulo e exige zero workers com contagens equilibradas de abertura e fechamento. Uma tentativa posterior encontrou um bloqueio temporário ao ler o arquivo da porta DevTools do WebView2. O executor repete a leitura apenas quando o arquivo está ausente ou temporariamente bloqueado, até o prazo já existente, e confere a faixa da porta. As correções foram feitas no coletor local. [Executor pareado](../../benchmarks/windows-objective-03.mjs) · [Coletor de medições do Windows](../../benchmarks/windows-tool.mjs)

## Investigação restante

O benchmark integrado estabelece os papéis dos processos e o resultado na janela curta. A origem das alocações dentro do WebView2, o comportamento com perfis aquecidos e a retenção de longo prazo seguem em aberto. O protocolo pré-release prevê pelo menos três sessões independentes pareadas, perfis novos e aquecidos e pelo menos 20 ciclos fixos por carga, seguidos de 30 minutos de repouso. Também prevê 60 segundos de amostras ambientais tranquilas antes da abertura e depois do fechamento, limiar de ruído definido, comparação entre fases equivalentes e rastreamento de alocações diante de suspeita de vazamento. Os limites de atribuição e duração permanecem até a coleta estendida. [Protocolo estendido e critérios de classificação](../objective-02/revision-02/memory-debt.pt-BR.md)
