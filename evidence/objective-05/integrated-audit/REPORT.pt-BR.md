# Auditoria integrada · Objetivo 05

[English](REPORT.md) · [Relatório do objetivo](../REPORT.pt-BR.md)

**DARS 0.5.0 · READY_FOR_REVIEW**

A fonte auditada é `50225fb5dccb677b10653058f81d89c168a5743c`. O SHA-256 do conjunto de artefatos web de produção é `9e19135cd5e85d01f60ae30c0a2b891de49ca696ec252c2cc61ec42889f1b491`. Os quatro jobs do GitHub Actions passaram na execução `45860076452`. O pacote verificado rodou no Windows físico com WebView2. O [registro de aceitação](../acceptance.json) cobre os 27 critérios da seção 19 da autorização do proprietário. [Inventário de artefatos](artifacts.json) · [Jobs hospedados](ci.json) · [GitHub Actions](https://github.com/daniloatila/universal-calculator-dars/actions/runs/45860076452)

## Verificações numéricas e operacionais

| Módulo | Validação local independente | Comparações nativas/WASM ou de contrato |
| --- | ---: | ---: |
| Estatística | 213 | 20 |
| Probabilidade | 277 em 17 famílias de distribuição | 57 |
| Simulação | 57 | 11 e mais 36 reexecuções por lote no mesmo alvo |
| Otimização | 39 e mais 2 casos de fronteira | 17 |
| Física e Engenharia | 47 | 14 |
| Graph Lab | 25 e mais 10 casos de fronteira | 16 |
| Data Lab | 55 verificações independentes de importação | 20 |

O registro preserva os hashes de binário e WASM emitidos por cada suíte. Esses recortes podem cobrir fluxos que se sobrepõem e usar binários locais distintos. Os 21 testes Rust de integração de Standard, os 133 de Universal e os 70 de Node estão registrados separadamente. Tanto localmente quanto no Ubuntu hospedado, o LLVM cobriu 5.734 de 5.983 linhas Rust incluídas (95,84%) nos sete módulos e nos dois núcleos científicos compartilhados. As crates Rust, o manifesto do workspace, o lockfile e a versão fixada do toolchain são idênticos entre a fonte das medições numéricas locais `1c816567d91524430779c93cf3c90984dfdcc99a` e a fonte auditada. Comparações independentes e comportamento observado sustentam os resultados nos intervalos validados. [Registro de testes](../tests.json) · [Cobertura local](../coverage.json) · [Cobertura hospedada](coverage-linux.json)

A Simulação usa uma sequência PCG32 versionada e registra semente, carga e agregação. O navegador e os oráculos independentes distinguem VaR 56 no nível `0.56` de VaR 57 no nível `0.560000000000000000000001` para as mesmas 100 observações. A apresentação aproximada mostra 0,56 nos dois casos. A prova preserva o decimal exato. A verificação de perda assinada também preserva perdas e ganhos pequenos quando o patrimônio arredondado coincide com o capital aportado. [Simulação](../simulation/REPORT.pt-BR.md) · [Registro do navegador](browser.json)

## Web de produção e regressões

O Chrome local 158.0.8127.38 passou em 224 testes, incluindo 172 herdados e 52 científicos. O Chromium hospedado no Ubuntu também passou em 224 testes. A execução do navegador inclui gráficos em 2D e 3D, invariância da prova matemática nos cinco perfis, inspeção do gráfico por teclado, processamento tabular, reexecução de pipeline e recuperação após cancelamento em Simulação, Otimização e Data Lab. A recuperação do renderizador foi ensaiada com eventos de contexto no Canvas real. A matriz de notação registra 420 comparações matemáticas, 210 financeiras e 294 científicas em 42 transições direcionais. Os rótulos científicos foram verificados nos sete idiomas e o árabe RTL a 320 pixels CSS. [Registro do navegador](browser.json) · [Matriz de idiomas](../locale-transition-matrix.json) · [Jobs hospedados](ci.json)

Os sete módulos científicos calcularam após recarga offline com os recursos locais preparados, sem solicitações fora da origem de teste durante as verificações observadas. Suítes separadas de produção executaram 10 verificações offline da web e cinco exemplos financeiros offline. O mapeamento da regressão herdada cobre 602 verificações, incluindo 17 no Windows físico, duas de credenciais e cinco de capacidades no Windows hospedado. Também cobre 2.355 casos matemáticos avançados de oráculo, 305 comparações matemáticas avançadas CLI/WASM, 577 casos financeiros independentes, 49 verificações financeiras herdadas CLI/WASM e duas suítes do comparador semântico com 84 casos cada, incluindo 79 reexecuções de prova por suíte. [Mapeamento de regressões](../regression.pt-BR.md) · [Regressão Windows](windows-regression.json) · [Jobs hospedados](ci.json)

## Windows físico

O executável AMD64 verificado veio do artefato hospedado `15137777779`. O verificador confirmou os hashes do ZIP e do executável e os metadados da fonte. O WebView2 158.0.4370.33 leu os 22 módulos WASM empacotados no Windows físico e confirmou os hashes do manifesto hospedado. O candidato rodou os sete módulos científicos offline e reabriu Graph Lab e Data Lab em três ciclos. Os 11 workers científicos fecharam e a árvore de processos do candidato chegou a zero após o encerramento. A suíte financeira nativa passou em cinco exemplos offline. O comparador normalizou as duas taxas históricas para `21/100`, com diferença exata zero, e reproduziu o cenário importado. [Recibo do artefato](windows-artifact.json) · [Execução física](windows-candidate.json) · [Finanças offline](windows-finance-offline.json) · [Reexecução do comparador](windows-finance-comparison.json)

## Desempenho, memória e segurança

Os benchmarks locais de WASM no Node registram latência da requisição à prova após inicialização e alocação linear. O benchmark separado da Simulação mede o tempo total do processo nativo para 100.000 sorteios normais e para dois milhões de passos em passeio aleatório e projeção financeira. O Data Lab importou CSVs sintéticos de três colunas com 1.000, 10.000, 100.000 e 200.000 linhas. Para 200.000 linhas, o CSV de 3.000.015 bytes levou cerca de 169 ms para importar e 149 ms para traçar o perfil em um processo Node independente. O recibo guarda tamanho de entrada, tipos, RSS, heap JavaScript, pico de RSS e capacidade linear do WASM. [Benchmarks](../benchmarks.json) · [Medições de volume do Data Lab](../data-lab/benchmarks.json)

Em uma sessão pareada no Windows, o tempo até o primeiro cálculo conferido em Standard foi de 591,84 ms na 0.4.1 e 603,52 ms na 0.5.0. A mediana da memória privada residente da árvore de processos em Standard visível foi de 99,82 MiB e 98,45 MiB, respectivamente, com seis amostras por versão. Compromisso privado, conjuntos de trabalho dos processos e memória geral do sistema são medições distintas. A meta de menos de 100 MB de RAM física incremental segue em aberto para o protocolo completo de atribuição e retenção. [Método Windows](windows-method.pt-BR.md) · [Observações pareadas](../benchmarks.json) · [Protocolo da dívida de memória](../../objective-02/revision-02/memory-debt.pt-BR.md)

O benchmark de Price repetiu casos equivalentes de 360 e 600 parcelas no WASM candidato. As duas amostras do comparador de 600 parcelas com arredondamento final levaram 9,29 e 9,38 segundos dentro do orçamento de 15 segundos do worker. As amostras da 0.4.1 levaram 10,71 e 11,04 segundos. Os ensaios usam o mesmo modelo de CPU e as mesmas configurações do cenário, com versões distintas do Node, atividade diferente do host e binários diferentes. [Comparação de Price](finance-price.json)

A base local do Cargo Audit registrou zero entradas na classe de vulnerabilidade e três avisos informativos herdados. `npm audit` registrou zero vulnerabilidades. O job de segurança do GitHub Actions passou na fonte exata. Os testes locais exercitam arquivos malformados ou grandes, caches de fórmulas em planilhas, dados semelhantes a HTML e exportação CSV protegida. Os módulos auditados processam essas entradas localmente nos workers e em WASM. [Recibo de segurança](security.json) · [Verificações de arquivos e privacidade](../security.pt-BR.md)

A fonte auditada e as evidências acompanham a entrega no branch de revisão. O commit final de evidências do branch é conferido por leitura do Git fora destes registros. O Objetivo 06 continua sujeito à aprovação explícita do proprietário. [Aceitação](../acceptance.json)
