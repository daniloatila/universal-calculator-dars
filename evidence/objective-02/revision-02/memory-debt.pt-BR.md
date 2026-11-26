# Dívida técnica de memória no desktop Windows

[English](memory-debt.md) · [Roteiro](../../../docs/pt-BR/roadmap.md)

**Estado** Aberta e monitorada. A auditoria independente do Objetivo 02 registrou como dívida técnica a meta de menos de 100 MB de RAM incremental no modo básico desktop visível. A revisão do agendador na versão 0.2.2 registra o achado da versão 0.2.1. A meta permanece sujeita à condição de viabilidade da missão original. [Missão original](../../../PROJECT_SPEC.md) · [Revisão 01 do Objetivo 02](../revision-01/REPORT.pt-BR.md)

## Observação registrada

O ensaio qualificado de Windows x64 e WebView2 de 25 de novembro de 2026 usou o DARS 0.2.1 do commit `1183df897d8042f01fdc3f43947ebcc27cd48c7e`. O mesmo processo do aplicativo completou quatro ciclos na ordem abaixo. Cada fase minimizada contribuiu com cinco amostras em cerca de 15 segundos. Os valores são medianas de cada fase em MiB. A árvore inclui o processo do DARS e seus descendentes. Os valores dos auxiliares vêm dos contadores separados desses processos. [Registro das medições](../revision-01/benchmarks.json) · [Protocolo dos ciclos sustentados](../../../benchmarks/windows-adaptive-cycles.pt-BR.md)

| Ciclo | Perfil | Commit privado da árvore | Commit privado do DARS | Commit privado dos auxiliares do WebView2 | Memória privada residente da árvore |
| --- | --- | ---: | ---: | ---: | ---: |
| 1 | Ultraleve | 252,42 | 5,59 | 246,83 | 84,72 |
| 2 | Máximo | 307,36 | 4,84 | 302,51 | 82,00 |
| 3 | Máximo | 308,43 | 5,59 | 302,84 | 82,85 |
| 4 | Ultraleve | 376,20 | 6,21 | 369,98 | 91,11 |

O commit privado da árvore minimizada cresceu 123,78 MiB do primeiro ao quarto ciclo. Os auxiliares responderam por 123,16 MiB desse aumento. As fases minimizadas registraram zero workers matemáticos. Após fechar o aplicativo, a árvore observada ficou sem descendentes. Em repouso visível, as medianas da memória privada residente dos dois ciclos Ultraleve foram 139,46 e 132,82 MiB. Memória privada residente e commit privado podem variar de forma independente. [Registro das medições, `windows_sustained.phases` e `windows_sustained.residualTreeAfterClose`](../revision-01/benchmarks.json)

Os contadores por processo localizam a maior parte do aumento nos auxiliares. A origem das alocações dentro do WebView2 e a tendência de longo prazo continuam indeterminadas. Nas medições após carga, a capacidade linear do WASM ficou em cerca de 1,12 MiB e o heap JavaScript em uso no renderizador ficou entre 5,79 e 6,95 MiB. Essas métricas de execução cobrem escopos diferentes e não podem ser somadas aos contadores de processos do Windows. Em outro ensaio comparativo, a estabilização após o primeiro resultado em modo básico visível registrou 100,88–100,93 MiB de memória privada residente da árvore. A meta de RAM física incremental continua sem comprovação. Variações da RAM do sistema incluem atividade fora da árvore. [Escopo e limitações](../revision-01/REPORT.pt-BR.md)

## Acompanhamento obrigatório nos Objetivos 03–08

Inclua uma verificação de memória no Windows a cada objetivo após a respectiva autorização. Registre as versões do build e do WebView2, perfil, carga, condições da linha de base, duração das fases, contagem de amostras e eventuais contadores indisponíveis. Registre memória privada residente e commit privado da árvore, do processo principal e dos auxiliares na inicialização, depois do primeiro resultado conferido, em repouso visível, na minimização e após a restauração. Verifique a quantidade de workers e os descendentes remanescentes após fechar. Inclua um fluxo representativo de cada novo módulo ou recurso de longa duração. Compare o cenário comum do Standard com a medição comparável mais recente, documente as diferenças nas evidências do objetivo e mantenha a pendência até sua investigação resolver o achado.

Para a meta do modo básico desktop, estime a RAM física incremental em bytes e MiB contra um controle de ambiente equivalente, incluindo os processos auxiliares e contabilizando páginas compartilhadas quando a atribuição for possível. Registre memória privada residente, commit privado e variação do sistema como observações separadas. A meta é inferior a 100.000.000 bytes (cerca de 95,37 MiB). Marque a meta como não verificada quando a medição não puder isolar a RAM incremental do aplicativo. [Missão original](../../../PROJECT_SPEC.md) · [Definição dos contadores](../../../benchmarks/windows-desktop.md#reading-the-measurements)

## Investigação antes da release 1.0.0

Execute o ensaio prolongado na auditoria autorizada antes do lançamento. Use pelo menos três sessões independentes com perfis novos do WebView2 e repita com perfis já aquecidos. Registre lotes de trabalho fixos e condições equivalentes das sessões. Inclua um ensaio do Standard em modo básico e outro com uma combinação representativa de módulos. Faça pelo menos 20 ciclos idênticos de cálculo, repouso, minimização e restauração por carga em cada sessão, seguidos de pelo menos 30 minutos de repouso sem carga e uma fase de fechamento e verificação. Use controles equivalentes sem carga e amostre pelo menos 60 segundos de ambiente estável antes de abrir e depois de fechar o aplicativo. Compare fases equivalentes. Uma leitura em cálculo e outra em minimização medem estados distintos.

Antes do ensaio, defina por contador uma tolerância de ruído como o maior valor entre 5 MiB e três vezes o desvio absoluto mediano das medianas de janelas de controle com a mesma duração. Divida os últimos 15 ciclos em três janelas consecutivas de cinco ciclos. Compare as medianas amostrais da mesma fase entre as janelas e aplique os critérios a seguir.

| Padrão | Evidência necessária |
| --- | --- |
| Recuperação | A mediana em repouso final fica no máximo na mediana estabilizada antes da carga mais a tolerância. Verifique a liberação dos workers e os contadores do dispositivo e dos processos após fechar. |
| Retenção limitada ou estabilização | As três últimas medianas da mesma fase ficam dentro da tolerância entre si. Uma mediana de repouso final que fique acima da linha de base estabilizada além da tolerância indica retenção no intervalo observado. Repita com perfis aquecidos antes de atribuir a retenção a caches ou ao alocador. |
| Crescimento sustentado | As três últimas medianas da mesma fase crescem em sequência, a última supera a primeira além da tolerância e o padrão se repete em três sessões independentes equivalentes. Investigue a função do processo e a fase. Repita com janelas maiores se a variabilidade dos controles impedir conclusão. |
| Vazamento confirmado | Uma reprodução controlada e o rastreamento de alocações ou recursos identificam crescimento persistente de objetos ou recursos que deveriam ter sido liberados. Verifique a etapa do ciclo de vida ou a correção que interrompe o crescimento com a mesma carga. Registre a atribuição como pendente se a instrumentação não identificar o recurso retido. |

Antes da release estável, documente o padrão observado, a sensibilidade da medição, o resultado da meta incremental e eventuais desvios. A revisão 0.2.2 reutilizou o registro de medições da 0.2.1 para formalizar a dívida. O ensaio prolongado está previsto para a auditoria anterior ao lançamento.

## Acompanhamento do Objetivo 04

Duas medições pareadas compararam a Standard auditada na 0.3.1 com a 0.4.0 no WebView2 158.0.4370.33. Em repouso visível na Standard, as medianas da memória privada residente da árvore passaram de 102.719.488 para 103.960.576 bytes na primeira dupla e de 106.807.296 para 104.046.592 bytes na segunda. O commit privado da árvore passou de 247.025.664 para 248.455.168 bytes e de 251.256.832 para 248.639.488 bytes. As duas execuções da 0.4.0 encerraram os cinco workers financeiros temporários e deixaram zero processos após fechar o aplicativo. Os caches do Windows foram mantidos no estado de cada execução. A meta de RAM física incremental e o ensaio prolongado de retenção continuam em aberto. [Primeira comparação](../../objective-04/desktop.json) · [Repetição](../../objective-04/desktop-repeat.json)

## Acompanhamento do Objetivo 05

A comparação física usou os executáveis de revisão da 0.4.1 e da 0.5.0 no mesmo Windows x64, com perfis WebView2 novos e o runtime 158.0.4370.33. A tabela mostra medianas em bytes da árvore inteira. O repouso da Standard teve seis amostras por versão, após os mesmos 12 cálculos.

| Medição | 0.4.1 | 0.5.0 |
| --- | ---: | ---: |
| Memória privada residente no repouso | 119.242.752 | 117.948.416 |
| Commit privado no repouso | 271.212.544 | 266.805.248 |
| Variação da RAM ocupada no sistema entre o controle ambiente e o repouso | 145.653.760 | 192.524.288 |

A 0.5.0 executou sete módulos científicos offline e repetiu gráficos e dados em três ciclos. Todos os 11 workers científicos encerraram. Depois do fechamento, as duas árvores ficaram com zero processos. A variação sistêmica inclui atividade externa, e as páginas compartilhadas não tiveram atribuição por aplicativo. A meta de menos de 100.000.000 bytes incrementais continua sem comprovação. O estudo pré-1.0 de três sessões com repouso prolongado permanece aberto. [0.4.1 no mesmo ensaio](../../objective-05/integrated-audit/windows-baseline.json) · [0.5.0 e ciclos](../../objective-05/integrated-audit/windows-candidate.json)

## Revisão 0.5.1 do Objetivo 05

Mesmo Windows x64, WebView2 158.0.4370.33, perfis novos e 6 amostras no repouso visível de cada execução.

| Medida em bytes | 0.5.0 | 0.5.1 |
| --- | ---: | ---: |
| Conjunto de trabalho privado da árvore | 121.049.088 | 119.152.640 |
| Memória privada comprometida da árvore | 271.839.232 | 268.509.184 |
| Diferença de RAM física do sistema entre repouso e controle ambiente | -2.437.120 | 129.417.216 |

A variação física de todo o sistema inclui atividade alheia ao aplicativo. A meta de menos de 100.000.000 de bytes incrementais e a investigação prolongada de retenção permanecem em aberto. [0.5.0](../../objective-05/revision-01/windows-baseline.json) · [0.5.1](../../objective-05/revision-01/windows-candidate.json)

## Comparação pareada 0.5.1 / 0.6.0

A comparação pareada usou o mesmo Windows físico e o mesmo WebView2. As linhas abrangem host e descendentes ativos no modo Padrão visível em repouso. A meta de menos de 100 MB e a avaliação de retenção prolongada permanecem em aberto. O teste não executou servidor de modelos.

| Mediana em bytes | 0.5.1 | 0.6.0 |
| --- | ---: | ---: |
| Conjunto de trabalho privado | 119537664 | 119656448 |
| Memória privada comprometida | 268533760 | 272506880 |
| Delta físico do sistema em relação ao controle | 183762944 | 200093696 |

[0.6.0](../../objective-06/integrated-audit/physical-windows-comparison.json)
