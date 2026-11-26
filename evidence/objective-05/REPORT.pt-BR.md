# Objetivo 05 · Ciência, engenharia e dados

[English](REPORT.md) · [Aceitação](acceptance.json) · [Reprodução](reproduction.pt-BR.md)

**READY_FOR_REVIEW.** O código auditado está no commit `50225fb5dccb677b10653058f81d89c168a5743c`. As 602 verificações herdadas foram reconciliadas entre seus testes de origem e as execuções atuais. O Chromium no Ubuntu passou nos 224 testes, e a cobertura instrumentada no Linux também chegou a 95,84%. Os quatro jobs do código passaram. O Objetivo 05 aguarda a decisão do proprietário no branch de revisão. [GitHub Actions](https://github.com/daniloatila/universal-calculator-dars/actions/runs/45860076452) · [Auditoria integrada](integrated-audit/REPORT.pt-BR.md)

O DARS 0.5.0 acrescenta sete ferramentas e chega a 22 módulos na interface compartilhada entre Windows e navegador. O proprietário aprovou o Objetivo 04 com 95/100. A versão 0.4.1 e suas evidências foram integradas à main, preservando os commits e o branch original. O Objetivo 05 tem branch próprio de revisão. O Objetivo 06 permanece NOT_STARTED. [Registro da aprovação](../objective-04/approval.json)

| Ferramenta | Comportamento verificado |
| --- | --- |
| [Estatística](statistics/REPORT.pt-BR.md) | Nos dados 1, 2, 3, 4, 5, a média e a mediana são 3, a variância populacional é 2 e a amostral é 5/2. A suíte cobre descrição, inferência, correlação, regressão, ausentes e modelos degenerados. |
| [Probabilidade](probability/REPORT.pt-BR.md) | Foram verificadas 17 famílias de distribuições. A CDF normal padrão em zero vale 0,5 e a massa binomial com dez tentativas equiprováveis vale 0,24609375 em cinco. Os testes incluem caudas, quantis e contagens centrais com um milhão de tentativas. |
| [Simulação](simulation/REPORT.pt-BR.md) | São registrados semente, versão do PCG32, número de amostras, distribuições e agregação. Em 36 execuções por lotes, a prova coincidiu byte a byte com a execução única. Níveis decimais de risco em lados diferentes de um limite selecionam os postos empíricos corretos. |
| [Otimização](optimization/REPORT.pt-BR.md) | Raízes e extremos informam resíduo, tolerância e motivo da parada. Os testes cobrem funções não convexas, descontinuidades e cancelamento aritmético. Programas lineares limitados, incompatíveis e ilimitados apresentam resultados distintos. |
| [Física e engenharia](physics-engineering/REPORT.pt-BR.md) | O cálculo confere dimensões. Aplicar 12 V a 6 Ω produz 2 A e 24 W. As provas distinguem relações exatas de unidades e constantes experimentais. |
| [Laboratório de gráficos](graph-lab/REPORT.pt-BR.md) | O navegador desenhou gráficos 2D e 3D. Foram exercitados lacuna em singularidade, inspeção por teclado, câmera, exportação e cinco perfis adaptativos, com preservação da prova numérica. |
| [Laboratório de dados](data-lab/REPORT.pt-BR.md) | CSV, TSV, JSON tabular e XLSX foram lidos localmente. Os testes incluem números extensos exatos, cache de fórmulas, células esparsas, pipeline tipado, manifesto com hash e exportação CSV protegida. |

## Evidências integradas

O Chrome instalado passou em 224 testes, incluindo os 172 herdados. A matriz contém 924 comparações de provas nas 42 trocas direcionais de idioma e nos 22 módulos. Os cinco exemplos financeiros e os sete módulos novos funcionaram offline após o preparo dos recursos. A suíte também cancelou workers e verificou a execução seguinte. As contagens de Rust, Node, oráculos de matemática e finanças e reprodução de provas têm escopos individuais. [Chrome](integrated-audit/browser.json) · [Matriz de idiomas](locale-transition-matrix.json) · [Regressões](regression.pt-BR.md) · [Registro de testes](tests.json)

A instrumentação local LLVM cobriu 5.734 de 5.983 linhas Rust incluídas (95,84%). Os relatórios individuais conservam o denominador de cada módulo. A medição não abrange a interface e complementa os oráculos e os ensaios em dispositivo real. Em processos Node independentes, foram conferidos os totais exatos de tabelas CSV de três colunas com mil, 10 mil, 100 mil e 200 mil linhas. No maior caso, com 3.000.015 bytes, a importação levou aproximadamente 169 ms e o perfil, 149 ms nesta máquina. [Cobertura](coverage.json) · [Benchmarks](benchmarks.json) · [Medições de dados](data-lab/benchmarks.json)

O teste de recuperação gráfica despachou eventos de contexto no Canvas real. A evidência não inclui falha física de GPU, benchmark em aparelho móvel ou release assinada para distribuição. A investigação prolongada de retenção de memória do Windows continua prevista para a auditoria anterior à 1.0. [Compatibilidade](compatibility.pt-BR.md) · [Segurança](security.pt-BR.md) · [Dependências](dependencies.pt-BR.md) · [Correções](changes.pt-BR.md)

No Windows físico, os sete módulos calcularam offline e o executável confirmou os hashes dos 22 motores WASM empacotados. A primeira resposta verificada da Standard levou 592 ms na 0.4.1 e 604 ms na 0.5.0, uma observação por versão. A mediana de memória privada residente da árvore em repouso foi de 119.242.752 e 117.948.416 bytes, respectivamente. Após três ciclos com gráficos e dados, os 11 workers científicos haviam encerrado. Ambas as versões terminaram com zero processos. [Windows 0.5.0](integrated-audit/windows-candidate.json) · [Comparação com a 0.4.1](integrated-audit/windows-baseline.json) · [Dívida de memória](../objective-02/revision-02/memory-debt.pt-BR.md)
